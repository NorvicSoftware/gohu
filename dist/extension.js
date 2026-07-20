"use strict";var w=Object.create;var _=Object.defineProperty;var S=Object.getOwnPropertyDescriptor;var y=Object.getOwnPropertyNames;var b=Object.getPrototypeOf,P=Object.prototype.hasOwnProperty;var x=(s,e)=>{for(var r in e)_(s,r,{get:e[r],enumerable:!0})},p=(s,e,r,t)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of y(e))!P.call(s,n)&&n!==r&&_(s,n,{get:()=>e[n],enumerable:!(t=S(e,n))||t.enumerable});return s};var u=(s,e,r)=>(r=s!=null?w(b(s)):{},p(e||!s||!s.__esModule?_(r,"default",{value:s,enumerable:!0}):r,s)),D=s=>p(_({},"__esModule",{value:!0}),s);var j={};x(j,{activate:()=>E,deactivate:()=>N});module.exports=D(j);var v=u(require("vscode"));var a=u(require("vscode")),c=u(require("fs")),m=u(require("os")),l=u(require("path")),g=require("child_process"),f=require("util"),$=(0,f.promisify)(g.exec),h=class s{static currentPanel;_panel;_extensionUri;_disposables=[];_projectPath;static createOrShow(e){let r=a.window.activeTextEditor?a.window.activeTextEditor.viewColumn:void 0;if(s.currentPanel){s.currentPanel._panel.reveal(r);return}let t=a.window.createWebviewPanel("Laravelgohu","Laravel Gohu",r||a.ViewColumn.One,{enableScripts:!0,retainContextWhenHidden:!0,localResourceRoots:[e]});s.currentPanel=new s(t,e)}constructor(e,r){this._panel=e,this._extensionUri=r,this._panel.webview.html=this._getHtmlContent();let t=a.workspace.getConfiguration("laravelTools").get("projectPath");this._projectPath=t&&t.trim()?t.trim():void 0,this._panel.onDidDispose(()=>this.dispose(),null,this._disposables),this._panel.webview.onDidReceiveMessage(async n=>{switch(n.command){case"ready":{this._projectPath&&this._panel.webview.postMessage({command:"setPath",path:this._projectPath}),await this._refreshServerStatus();break}case"checkStatus":{await this._refreshServerStatus();break}case"openFolder":{let i=await a.window.showOpenDialog({canSelectFolders:!0,canSelectFiles:!1,canSelectMany:!1,openLabel:"Select folder"});i&&i.length>0&&(this._projectPath=i[0].fsPath,await a.workspace.getConfiguration("laravelTools").update("projectPath",this._projectPath,a.ConfigurationTarget.Global),this._panel.webview.postMessage({command:"setPath",path:this._projectPath}),await this._refreshServerStatus());break}case"run":{await this._runQuery(typeof n.text=="string"?n.text:"");break}case"editorContent":break}},null,this._disposables)}_phpBinary(){let e=a.workspace.getConfiguration("laravelTools").get("phpBinary");return e&&e.trim()?e.trim():"php"}async _refreshServerStatus(){this._panel.webview.postMessage({command:"setServerStatus",status:"checking"});let e=await this._checkServerStatus();this._panel.webview.postMessage({command:"setServerStatus",status:e.error?"offline":"online",details:e})}async _checkServerStatus(){let e=this._phpBinary(),r=this._projectPath,t={projectPath:r,laravelDetected:!1,phpBinary:e};if(!r)return t.error="No project folder selected.",t;if(!c.existsSync(l.join(r,"artisan")))return t.error='Not a Laravel project: "artisan" was not found in the selected folder.',t;t.laravelDetected=!0;let n="DB::connection()->getPdo();echo json_encode(['php_version'=>PHP_VERSION,'connection'=>DB::connection()->getName(),'driver'=>DB::connection()->getDriverName(),'database'=>DB::connection()->getDatabaseName()]);";try{let{stdout:i}=await $(`${e} artisan tinker --execute="${n}"`,{cwd:r,timeout:15e3,windowsHide:!0}),o=this._extractJson(i);return o?(t.phpVersion=o.php_version,t.connection=o.connection,t.driver=o.driver,t.database=o.database,t):(t.error="Could not read the database status from the Artisan output.",t)}catch(i){return t.error=this._cleanError(i),t}}_extractJson(e){let r=e.indexOf("{"),t=e.lastIndexOf("}");if(!(r===-1||t===-1||t<r))try{return JSON.parse(e.slice(r,t+1))}catch{return}}_cleanError(e){let r=e;return(r?.stderr||r?.stdout||r?.message||"Unknown error").toString().trim().slice(0,600)||"Unknown error"}async _runQuery(e){this._panel.webview.postMessage({command:"queryRunning"});let r=await this._executeQuery(e);this._panel.webview.postMessage({command:"queryResult",result:r})}async _executeQuery(e){let r=this._phpBinary(),t=this._projectPath;if(!t)return{success:!1,error:"No project folder selected."};if(!c.existsSync(l.join(t,"artisan")))return{success:!1,error:'Not a Laravel project: "artisan" was not found in the selected folder.'};if(!e||!e.trim())return{success:!1,error:"The editor is empty. Write an Eloquent or Query Builder statement to run."};let n=this._writeRunnerScript(e),i=n.replace(/\\/g,"/");try{let{stdout:o}=await $(`${r} artisan tinker --execute="require '${i}';"`,{cwd:t,timeout:3e4,windowsHide:!0,maxBuffer:33554432}),d=this._extractJson(o);return d||{success:!1,error:`Could not parse the result from Artisan output.

`+o.trim().slice(0,1e3)}}catch(o){return{success:!1,error:this._cleanError(o)}}finally{try{c.unlinkSync(n)}catch{}}}_writeRunnerScript(e){let r="GOHU_"+Math.random().toString(36).slice(2,14).toUpperCase(),t=`<?php
$__gohu_start = microtime(true);
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

    // Elapsed time of the actual query execution, in milliseconds.
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

    echo json_encode([
        'success' => true,
        'total' => $__gohu_total,
        'query_time' => $__gohu_ms . ' ms',
        'database' => $__gohu_conn->getDatabaseName(),
        'connection_name' => $__gohu_conn->getName(),
        'data' => $__gohu_data,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (\\Throwable $__gohu_e) {
    echo json_encode([
        'success' => false,
        'error' => $__gohu_e->getMessage(),
        'query_time' => round((microtime(true) - $__gohu_start) * 1000, 2) . ' ms',
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
`,n=l.join(m.tmpdir(),`gohu-run-${Date.now()}-${Math.random().toString(36).slice(2)}.php`);return c.writeFileSync(n,t,"utf8"),n}dispose(){for(s.currentPanel=void 0,this._panel.dispose();this._disposables.length;){let e=this._disposables.pop();e&&e.dispose()}}_getHtmlContent(){let e=l.join(this._extensionUri.fsPath,"src","webview","panel.html");return c.readFileSync(e,"utf8")}};function E(s){s.subscriptions.push(v.commands.registerCommand("gohu.openPanel",()=>{h.createOrShow(s.extensionUri)}))}function N(){}0&&(module.exports={activate,deactivate});
