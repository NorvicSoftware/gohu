<?php
/**
 * Gohu N+1 static scanner (heuristic).
 * Usage: php scanner.php <scanBase> <vendorAutoload>
 *   scanBase       = Laravel project root to scan (uses app/)
 *   vendorAutoload = path to a vendor/autoload.php that provides nikic/php-parser
 */

$scanBase = $argv[1] ?? getcwd();
$autoload = $argv[2] ?? ($scanBase . '/vendor/autoload.php');

if (!is_file($autoload)) {
    echo json_encode(['success' => false, 'error' => 'Composer autoload not found: ' . $autoload]);
    exit;
}
require $autoload;

use PhpParser\ParserFactory;
use PhpParser\NodeFinder;
use PhpParser\Node;

if (!class_exists(ParserFactory::class)) {
    echo json_encode(['success' => false, 'error' => 'nikic/php-parser is not available in this project.']);
    exit;
}

$factory = new ParserFactory();
$parser = method_exists($factory, 'createForNewestSupportedVersion')
    ? $factory->createForNewestSupportedVersion()
    : $factory->create(ParserFactory::PREFER_PHP7);
$finder = new NodeFinder();

$RELATION_METHODS   = ['hasMany','belongsTo','belongsToMany','hasOne','morphMany','morphTo','morphOne','morphToMany','hasManyThrough','hasOneThrough'];
$COLLECTION_TERMINALS = ['get','all','paginate','simplePaginate','cursor','lazy'];
$EAGER              = ['with','load','loadMissing'];
$LOOP_METHODS       = ['each','map','filter','reject','flatMap','groupBy','sortBy','partition'];

function php_files($dir) {
    if (!is_dir($dir)) return [];
    $out = [];
    $rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($rii as $f) {
        if ($f->isFile() && strtolower($f->getExtension()) === 'php') $out[] = $f->getPathname();
    }
    return $out;
}

/* ── 1) Relationship map: shortModelName => [relationName => true] ── */
$relationMap = [];
foreach (php_files($scanBase . '/app') as $file) {
    try { $ast = $parser->parse(file_get_contents($file)); } catch (\Throwable $e) { continue; }
    if (!$ast) continue;
    foreach ($finder->findInstanceOf($ast, Node\Stmt\Class_::class) as $class) {
        if (!$class->name) continue;
        $cn = $class->name->toString();
        foreach ($class->getMethods() as $method) {
            if (!$method->name) continue;
            foreach ($finder->findInstanceOf((array) $method->stmts, Node\Expr\MethodCall::class) as $c) {
                if ($c->name instanceof Node\Identifier
                    && in_array($c->name->toString(), $RELATION_METHODS, true)
                    && $c->var instanceof Node\Expr\Variable
                    && $c->var->name === 'this') {
                    $relationMap[$cn][$method->name->toString()] = true;
                    break;
                }
            }
        }
    }
}

/* ── helpers ── */
function query_model($expr, $EAGER, $TERMINALS) {
    // Walk a ->/:: chain; return the model short name if it's a collection query WITHOUT eager loading.
    $node = $expr; $chain = []; $model = null;
    while (true) {
        if ($node instanceof Node\Expr\MethodCall) {
            if ($node->name instanceof Node\Identifier) $chain[] = $node->name->toString();
            $node = $node->var;
        } elseif ($node instanceof Node\Expr\StaticCall) {
            if ($node->name instanceof Node\Identifier) $chain[] = $node->name->toString();
            if ($node->class instanceof Node\Name) $model = $node->class->getLast();
            break;
        } else {
            break;
        }
    }
    if ($model === null) return null;
    $hasTerminal = (bool) array_intersect($chain, $TERMINALS);
    if (!$hasTerminal) return null;
    if (array_intersect($chain, $EAGER)) return null; // eager loaded → safe
    return $model;
}

function rel_of($node, $itemVar) {
    // If $node is a PropertyFetch of form $item->X, return "X".
    if ($node instanceof Node\Expr\PropertyFetch
        && $node->var instanceof Node\Expr\Variable
        && $node->var->name === $itemVar
        && $node->name instanceof Node\Identifier) {
        return $node->name->toString();
    }
    return null;
}

/* ── analyze a single loop body for N+1 relation accesses ── */
function analyze_loop($bodyNodes, $itemVar, $model, $relationMap, $finder, $file, $findings) {
    $flagged = []; // rel => ['line'=>, 'confidence'=>]
    $add = function ($rel, $line, $conf) use (&$flagged) {
        if (!isset($flagged[$rel]) || ($conf === 'high' && $flagged[$rel]['confidence'] !== 'high')) {
            $flagged[$rel] = ['line' => $line, 'confidence' => $conf];
        }
    };

    // Confirmed relations accessed directly: $item->rel  (rel is a known relationship of the model)
    foreach ($finder->findInstanceOf($bodyNodes, Node\Expr\PropertyFetch::class) as $pf) {
        $rel = rel_of($pf, $itemVar);
        if ($rel !== null && isset($relationMap[$model][$rel])) {
            $add($rel, $pf->getLine(), 'high');
        }
    }
    // Chained access: $item->rel->..., $item->rel()->..., foreach ($item->rel ...) → likely relation
    $chainRoots = array_merge(
        $finder->findInstanceOf($bodyNodes, Node\Expr\PropertyFetch::class),
        $finder->findInstanceOf($bodyNodes, Node\Expr\MethodCall::class)
    );
    foreach ($chainRoots as $n) {
        $rel = rel_of($n->var, $itemVar);
        if ($rel !== null) {
            $conf = isset($relationMap[$model][$rel]) ? 'high' : 'medium';
            $add($rel, $n->getLine(), $conf);
        }
    }
    foreach ($finder->findInstanceOf($bodyNodes, Node\Stmt\Foreach_::class) as $fe2) {
        $rel = rel_of($fe2->expr, $itemVar);
        if ($rel !== null) {
            $conf = isset($relationMap[$model][$rel]) ? 'high' : 'medium';
            $add($rel, $fe2->getLine(), $conf);
        }
    }

    foreach ($flagged as $rel => $info) {
        $findings[] = [
            'file' => $file,
            'line' => $info['line'],
            'model' => $model,
            'relation' => $rel,
            'code' => '$' . $itemVar . '->' . $rel,
            'suggestion' => $model . "::with('" . $rel . "')->get()",
            'confidence' => $info['confidence'],
        ];
    }
    return $findings;
}

/* ── 2) Scan app/ (controllers, jobs, services, livewire, actions, ...) ── */
$files = php_files($scanBase . '/app');
$findings = [];
$scanned = 0;

foreach ($files as $file) {
    try { $ast = $parser->parse(file_get_contents($file)); } catch (\Throwable $e) { continue; }
    if (!$ast) continue;
    $scanned++;
    $rel = ltrim(str_replace($scanBase, '', $file), '/\\');

    // process each function-like scope so variable assignments are local
    $scopes = array_merge(
        $finder->findInstanceOf($ast, Node\Stmt\ClassMethod::class),
        $finder->findInstanceOf($ast, Node\Stmt\Function_::class)
    );
    foreach ($scopes as $scope) {
        $body = (array) $scope->stmts;
        if (!$body) continue;

        // local assignments: $var = <collection query without with>
        $assign = [];
        foreach ($finder->findInstanceOf($body, Node\Expr\Assign::class) as $a) {
            if ($a->var instanceof Node\Expr\Variable && is_string($a->var->name)) {
                $m = query_model($a->expr, $EAGER, $COLLECTION_TERMINALS);
                if ($m) $assign[$a->var->name] = $m;
            }
        }

        // foreach loops
        foreach ($finder->findInstanceOf($body, Node\Stmt\Foreach_::class) as $fe) {
            $model = null;
            if ($fe->expr instanceof Node\Expr\Variable && isset($assign[$fe->expr->name])) {
                $model = $assign[$fe->expr->name];
            } else {
                $model = query_model($fe->expr, $EAGER, $COLLECTION_TERMINALS);
            }
            if (!$model) continue;
            if (!($fe->valueVar instanceof Node\Expr\Variable) || !is_string($fe->valueVar->name)) continue;
            $findings = analyze_loop((array) $fe->stmts, $fe->valueVar->name, $model, $relationMap, $finder, $rel, $findings);
        }

        // loop-style method calls: ->each(fn), ->map(fn), etc.
        foreach ($finder->findInstanceOf($body, Node\Expr\MethodCall::class) as $mc) {
            if (!($mc->name instanceof Node\Identifier) || !in_array($mc->name->toString(), $LOOP_METHODS, true)) continue;
            if (!$mc->args) continue;
            $closure = $mc->args[0]->value ?? null;
            if (!($closure instanceof Node\Expr\Closure) && !($closure instanceof Node\Expr\ArrowFunction)) continue;
            // source model
            $model = null;
            if ($mc->var instanceof Node\Expr\Variable && isset($assign[$mc->var->name])) {
                $model = $assign[$mc->var->name];
            } else {
                $model = query_model($mc->var, $EAGER, $COLLECTION_TERMINALS);
            }
            if (!$model) continue;
            // item var = first param
            $params = $closure->params ?? [];
            if (!$params || !($params[0]->var instanceof Node\Expr\Variable)) continue;
            $itemVar = $params[0]->var->name;
            $bodyNodes = $closure instanceof Node\Expr\ArrowFunction ? [$closure->expr] : (array) $closure->stmts;
            $findings = analyze_loop($bodyNodes, $itemVar, $model, $relationMap, $finder, $rel, $findings);
        }
    }
}

/* ── dedupe by file+line+relation ── */
$seen = []; $unique = [];
foreach ($findings as $f) {
    $k = $f['file'] . ':' . $f['line'] . ':' . $f['relation'];
    if (isset($seen[$k])) continue;
    $seen[$k] = true; $unique[] = $f;
}

echo json_encode([
    'success' => true,
    'scanned_files' => $scanned,
    'total_detected' => count($unique),
    'findings' => array_values($unique),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
