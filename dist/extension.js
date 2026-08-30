"use strict";var w=Object.create;var h=Object.defineProperty;var b=Object.getOwnPropertyDescriptor;var S=Object.getOwnPropertyNames;var y=Object.getPrototypeOf,P=Object.prototype.hasOwnProperty;var x=(n,e)=>{for(var r in e)h(n,r,{get:e[r],enumerable:!0})},g=(n,e,r,t)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of S(e))!P.call(n,o)&&o!==r&&h(n,o,{get:()=>e[o],enumerable:!(t=b(e,o))||t.enumerable});return n};var l=(n,e,r)=>(r=n!=null?w(y(n)):{},g(e||!n||!n.__esModule?h(r,"default",{value:n,enumerable:!0}):r,n)),j=n=>g(h({},"__esModule",{value:!0}),n);var D={};x(D,{activate:()=>N,deactivate:()=>k});module.exports=j(D);var v=l(require("vscode"));var s=l(require("vscode")),_=l(require("fs")),$=l(require("os")),c=l(require("path")),m=require("child_process"),f=require("util"),d=(0,f.promisify)(m.exec),p=class n{static currentPanel;_panel;_extensionUri;_disposables=[];_projectPath;static createOrShow(e){let r=s.window.activeTextEditor?s.window.activeTextEditor.viewColumn:void 0;if(n.currentPanel){n.currentPanel._panel.reveal(r);return}let t=s.window.createWebviewPanel("Laravelgohu","Laravel Gohu",r||s.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[e]});n.currentPanel=new n(t,e)}constructor(e,r){this._panel=e,this._extensionUri=r,this._panel.webview.html=this._getHtmlContent();let t=s.workspace.getConfiguration("laravelTools").get("projectPath");this._projectPath=t&&t.trim()?t.trim():void 0,this._panel.onDidDispose(()=>this.dispose(),null,this._disposables),this._panel.webview.onDidReceiveMessage(async o=>{switch(o.command){case"ready":{this._projectPath&&this._panel.webview.postMessage({command:"setPath",path:this._projectPath}),await this._refreshServerStatus();break}case"checkStatus":{await this._refreshServerStatus();break}case"openFolder":{let a=await s.window.showOpenDialog({canSelectFolders:!0,canSelectFiles:!1,canSelectMany:!1,openLabel:"Select folder"});a&&a.length>0&&(this._projectPath=a[0].fsPath,await s.workspace.getConfiguration("laravelTools").update("projectPath",this._projectPath,s.ConfigurationTarget.Global),this._panel.webview.postMessage({command:"setPath",path:this._projectPath}),await this._refreshServerStatus());break}case"run":{await this._runQuery(typeof o.text=="string"?o.text:"");break}case"scanNPlusOne":{await this._scanNPlusOne();break}case"openFile":{await this._openFile(o.file,o.line);break}case"editorContent":break}},null,this._disposables)}_phpBinary(){let e=s.workspace.getConfiguration("laravelTools").get("phpBinary");return e&&e.trim()?e.trim():"php"}_nPlusOneThreshold(){let e=s.workspace.getConfiguration("laravelTools").get("nPlusOneThreshold");return typeof e=="number"&&e>=2?Math.floor(e):3}async _refreshServerStatus(){this._panel.webview.postMessage({command:"setServerStatus",status:"checking"});let e=await this._checkServerStatus();this._panel.webview.postMessage({command:"setServerStatus",status:e.error?"offline":"online",details:e})}async _checkServerStatus(){let e=this._phpBinary(),r=this._projectPath,t={projectPath:r,laravelDetected:!1,phpBinary:e};if(!r)return t.error="No project folder selected.",t;if(!_.existsSync(c.join(r,"artisan")))return t.error='Not a Laravel project: "artisan" was not found in the selected folder.',t;t.laravelDetected=!0;let o="DB::connection()->getPdo();echo json_encode(['php_version'=>PHP_VERSION,'connection'=>DB::connection()->getName(),'driver'=>DB::connection()->getDriverName(),'database'=>DB::connection()->getDatabaseName()]);";try{let{stdout:a}=await d(`${e} artisan tinker --execute="${o}"`,{cwd:r,timeout:15e3,windowsHide:!0}),i=this._extractJson(a);return i?(t.phpVersion=i.php_version,t.connection=i.connection,t.driver=i.driver,t.database=i.database,t):(t.error="Could not read the database status from the Artisan output.",t)}catch(a){return t.error=this._cleanError(a),t}}_extractJson(e){let r=e.indexOf("{"),t=e.lastIndexOf("}");if(!(r===-1||t===-1||t<r))try{return JSON.parse(e.slice(r,t+1))}catch{return}}_cleanError(e){let r=e;return(r?.stderr||r?.stdout||r?.message||"Unknown error").toString().trim().slice(0,600)||"Unknown error"}async _runQuery(e){this._panel.webview.postMessage({command:"queryRunning"});let r=await this._executeQuery(e);this._panel.webview.postMessage({command:"queryResult",result:r})}async _scanNPlusOne(){let e=this._projectPath;if(!e){this._panel.webview.postMessage({command:"scanResult",result:{success:!1,error:"No project folder selected."}});return}if(!_.existsSync(c.join(e,"artisan"))){this._panel.webview.postMessage({command:"scanResult",result:{success:!1,error:'Not a Laravel project: "artisan" was not found in the selected folder.'}});return}this._panel.webview.postMessage({command:"scanRunning"});let r=this._phpBinary(),t=c.join(this._extensionUri.fsPath,"media","n1-scanner.php").replace(/\\/g,"/"),o=e.replace(/\\/g,"/");try{let{stdout:a}=await d(`${r} "${t}" "${o}" "${o}/vendor/autoload.php"`,{cwd:e,timeout:9e4,windowsHide:!0,maxBuffer:33554432}),u=this._extractJson(a)||{success:!1,error:`Could not parse the scan output.

`+a.trim().slice(0,1e3)};this._panel.webview.postMessage({command:"scanResult",result:u})}catch(a){this._panel.webview.postMessage({command:"scanResult",result:{success:!1,error:this._cleanError(a)}})}}async _openFile(e,r){if(!this._projectPath||typeof e!="string")return;let t=c.isAbsolute(e)?e:c.join(this._projectPath,e);try{let o=await s.workspace.openTextDocument(t),a=await s.window.showTextDocument(o,{viewColumn:s.ViewColumn.Beside}),i=Math.max(0,(typeof r=="number"?r:1)-1),u=new s.Position(i,0);a.selection=new s.Selection(u,u),a.revealRange(new s.Range(u,u),s.TextEditorRevealType.InCenter)}catch{s.window.showWarningMessage("Laravel Gohu: could not open "+t)}}async _executeQuery(e){let r=this._phpBinary(),t=this._projectPath;if(!t)return{success:!1,error:"No project folder selected."};if(!_.existsSync(c.join(t,"artisan")))return{success:!1,error:'Not a Laravel project: "artisan" was not found in the selected folder.'};if(!e||!e.trim())return{success:!1,error:"The editor is empty. Write an Eloquent or Query Builder statement to run."};let o=this._writeRunnerScript(e),a=o.replace(/\\/g,"/");try{let{stdout:i}=await d(`${r} artisan tinker --execute="require '${a}';"`,{cwd:t,timeout:3e4,windowsHide:!0,maxBuffer:33554432}),u=this._extractJson(i);return u||{success:!1,error:`Could not parse the result from Artisan output.

`+i.trim().slice(0,1e3)}}catch(i){return{success:!1,error:this._cleanError(i)}}finally{try{_.unlinkSync(o)}catch{}}}_writeRunnerScript(e){let r="GOHU_"+Math.random().toString(36).slice(2,14).toUpperCase(),t=this._nPlusOneThreshold(),o=`<?php
$__gohu_start = microtime(true);

// Capture every SQL statement the snippet runs (for db_time + N+1 detection).
$__gohu_q = [];
\\Illuminate\\Support\\Facades\\DB::listen(function ($__gohu_ev) use (&$__gohu_q) {
    $__gohu_q[] = ['sql' => $__gohu_ev->sql, 'time' => $__gohu_ev->time];
});

try {
    $__gohu_code = <<<'${r}'
${e}
${r};

    $__gohu_result = eval(gohu_returnable($__gohu_code));

    if ($__gohu_result instanceof \\Illuminate\\Database\\Eloquent\\Builder
        || $__gohu_result instanceof \\Illuminate\\Database\\Query\\Builder
        || $__gohu_result instanceof \\Illuminate\\Database\\Eloquent\\Relations\\Relation) {
        $__gohu_result = $__gohu_result->get();
    }

    // Total wall-clock time of the whole snippet (PHP + connection + DB + hydration).
    $__gohu_ms = round((microtime(true) - $__gohu_start) * 1000, 2);

    $__gohu_limit = 20;

    if ($__gohu_result instanceof \\Illuminate\\Support\\Collection) {
        $__gohu_total = $__gohu_result->count();
        $__gohu_data = $__gohu_result->take($__gohu_limit)->values()->toArray();
    } elseif ($__gohu_result instanceof \\Illuminate\\Database\\Eloquent\\Model) {
        $__gohu_total = 1;
        $__gohu_data = $__gohu_result->toArray();
    } elseif (is_array($__gohu_result)) {
        $__gohu_total = count($__gohu_result);
        $__gohu_data = array_slice($__gohu_result, 0, $__gohu_limit);
    } else {
        $__gohu_total = is_null($__gohu_result) ? 0 : 1;
        $__gohu_data = $__gohu_result;
    }

    $__gohu_conn = \\Illuminate\\Support\\Facades\\DB::connection();

    // Build the queries block: total DB time + N+1 detection (same SQL repeated).
    $__gohu_db_time = 0.0;
    $__gohu_groups = [];
    foreach ($__gohu_q as $__gohu_row) {
        $__gohu_db_time += $__gohu_row['time'];
        $__gohu_groups[$__gohu_row['sql']] = ($__gohu_groups[$__gohu_row['sql']] ?? 0) + 1;
    }
    $__gohu_queries = [
        'detected_N+1' => false,
        'count' => count($__gohu_q),
        'db_time' => round($__gohu_db_time, 2) . ' ms',
    ];
    if ($__gohu_groups) {
        arsort($__gohu_groups);
        $__gohu_top_sql = array_key_first($__gohu_groups);
        if ($__gohu_groups[$__gohu_top_sql] >= ${t}) {
            $__gohu_queries['detected_N+1'] = true;
            $__gohu_queries['n_plus_one'] = [
                'sql' => $__gohu_top_sql,
                'times' => $__gohu_groups[$__gohu_top_sql],
            ];
        }
    }

    echo json_encode([
        'success' => true,
        'total' => $__gohu_total,
        'total_time' => $__gohu_ms . ' ms',
        'database' => $__gohu_conn->getDatabaseName(),
        'connection_name' => $__gohu_conn->getName(),
        'queries' => $__gohu_queries,
        'data' => $__gohu_data,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (\\Throwable $__gohu_e) {
    echo json_encode([
        'success' => false,
        'error' => $__gohu_e->getMessage(),
        'total_time' => round((microtime(true) - $__gohu_start) * 1000, 2) . ' ms',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function gohu_returnable($code) {
    $code = trim($code);
    $code = preg_replace('/^\\s*<\\?php/i', '', $code);
    $code = preg_replace('/\\?>\\s*$/', '', $code);
    $code = rtrim(trim($code), ';');
    if ($code === '') { return 'return null;'; }

    // True if the snippet has something other than comments/whitespace.
    $meaningful = function ($snippet) {
        foreach (token_get_all('<?php ' . $snippet) as $t) {
            if (is_array($t)) {
                if (!in_array($t[0], [T_OPEN_TAG, T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) { return true; }
            } else {
                return true;
            }
        }
        return false;
    };

    if (!$meaningful($code)) { return 'return null;'; }

    $tokens = token_get_all('<?php ' . $code);
    array_shift($tokens);

    $depth = 0;
    $lastSemi = -1;
    foreach ($tokens as $i => $t) {
        $text = is_array($t) ? $t[1] : $t;
        if ($text === '{' || $text === '(' || $text === '[') { $depth++; }
        elseif ($text === '}' || $text === ')' || $text === ']') { $depth--; }
        elseif ($text === ';' && $depth === 0) { $lastSemi = $i; }
    }

    $render = function ($slice) {
        $out = '';
        foreach ($slice as $t) { $out .= is_array($t) ? $t[1] : $t; }
        return $out;
    };

    if ($lastSemi === -1) {
        $stmt = trim($render($tokens));
        return preg_match('/^return\\b/', $stmt) ? $stmt . ';' : 'return (' . $stmt . ');';
    }

    $head = $render(array_slice($tokens, 0, $lastSemi + 1));
    $tail = trim($render(array_slice($tokens, $lastSemi + 1)));
    if ($tail === '' || !$meaningful($tail)) { return $head; }
    if (preg_match('/^return\\b/', $tail)) { return $head . "\\n" . $tail . ';'; }
    return $head . "\\nreturn (" . $tail . ');';
}
`,a=c.join($.tmpdir(),`gohu-run-${Date.now()}-${Math.random().toString(36).slice(2)}.php`);return _.writeFileSync(a,o,"utf8"),a}dispose(){for(n.currentPanel=void 0,this._panel.dispose();this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}_getHtmlContent(){let e=c.join(this._extensionUri.fsPath,"media","panel.html");return _.readFileSync(e,"utf8")}};function N(n){n.subscriptions.push(v.commands.registerCommand("gohu.openPanel",()=>{p.createOrShow(n.extensionUri)}))}function k(){}0&&(module.exports={activate,deactivate});
