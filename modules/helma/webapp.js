/*
 * The app module can be used to control a web application from javascript.
 * Currently this isn't used by the helma command line server (server.jar),
 * but it can be used to start the application server from the shell using
 * the following command:
 *
 *   importModule('app');
 *   app.start();
 *
 * It takes care of the following things:
 *
 *  - Initializing native host objects
 *  - Setting interceptors or rules to automatically switch optimization
 *      mode on certain requests
 *  - Starting and configuring the web server
 *
 */

__shared__ = true;

// import modules
loadModule('core.string');
loadModule('helma.webapp.request');
loadModule('helma.webapp.response');
var continuation = loadModule('helma.webapp.continuation');
var system = loadModule('helma.system');
var server = loadModule('helma.httpserver');
var log = loadModule('helma.logging').getLogger(__name__);


/**
 * Handler function that connects to the Helma servlet. Import this
 * into your main module scope:
 *
 * <code>importFromModule('helma.simpleweb', 'handleRequest');</code>
 *
 * @param req
 * @param res
 */
function handleRequest(req, res) {
    // invoke onRequest
    system.invokeCallback('onRequest', null, [req]);
    // set default content type
    res.contentType = "text/html; charset=UTF-8";
    // resume continuation?
    if (continuation.resume(req, res)) {
        return;
    }

    // resolve path and invoke action
    var path = req.path;
    if (path.startsWith('/')) {
        // strip leading slash
        path = path.slice(1)
    }

    function getRegExp(pattern) {
        if (pattern instanceof RegExp) {
            return pattern;
        } else if (typeof pattern == "string") {
            return new RegExp(pattern);
        } else {
            throw Error("Pattern must be a regular expression or string");
        }
    }

    try {
        log.debug('resolving path ' + path);
        var setup = loadModule('setup');
        log.debug('got setup: ' + setup);
        if (setup.urls instanceof Array) {
            var urls = setup.urls;
            for (var i = 0; i < urls.length; i++) {
                log.debug("checking url line: " + urls[i]);
                var match = getRegExp(urls[i][0]).exec(path);
                log.debug("got match: " + match);
                if (match != null) {
                    var action = urls[i][1];
                    log.debug("action: " + action);
                    if (typeof action == "string") {
                        log.debug("action is string");
                        var dot = action.lastIndexOf('.');
                        if (dot < 0) {
                            throw Error('Action must be of form "module.function"');
                        }
                        var module = action.slice(0, dot);
                        var func = action.slice(dot + 1);
                        action = loadModule(module)[func];
                        if (log.isDebugEnabled()) {
                            log.debug("resolved action: " + action);
                        }
                    } else if (typeof action == "function") {
                        throw Error('Action must either be a string or a function');
                    }
                    // got a match - add any regexp groups as additional action arguments
                    var args = [req, res];
                    for (var j = 1; j < match.length; j++) {
                        args.push(match[j]);
                    }
                    if (typeof action == "function") {
                        action.apply(null, args);
                        return;
                    }
                }
            }
        }
        notfound(req, res);
    } catch (e) {
        error(req, res, e);
    } finally {
        system.invokeCallback('onResponse', null, [res]);
    }
}

/**
 * Standard error page
 * @param e the error that happened
 */
function error(req, res, e) {
    res.status = 500;
    res.contentType = 'text/html';
    res.writeln('<h2>', e, '</h2>');
    if (e.fileName && e.lineNumber) {
        res.writeln('<p>In file<b>', e.fileName, '</b>at line<b>', e.lineNumber, '</b></p>');
    }
    if (e.rhinoException) {
        res.writeln('<h3>Script Stack</h3>');
        res.writeln('<pre>', e.rhinoException.scriptStackTrace, '</pre>');
        res.writeln('<h3>Java Stack</h3>');
        var writer = new java.io.StringWriter();
        var printer = new java.io.PrintWriter(writer);
        e.rhinoException.printStackTrace(printer);
        res.writeln('<pre>', writer.toString(), '</pre>');
    }
    return null;
}

/**
 * Standard notfound page
 */
function notfound(req, res) {
    res.status = 404;
    res.contentType = 'text/html';
    res.writeln('<h1>Not Found</h1>');
    res.writeln('The requested URL', req.path, 'was not found on the server.');
    return null;
}

/**
 * Start the jetty server.
 */
function start(config) {
    // start jetty http server
    var setup;
    var httpConf;
    try {
        setup = config || loadModule('setup');
        httpConf = setup.httpConf;
    } catch (noSetup) {
        log.info('Couldn\'t load setup module - using defaults');
    }
    server.start(httpConf);
}


/**
 * Stop the jetty server.
 */
function stop() {
    // stop jetty HTTP server
    server.stop();
}

if (__name__ == '__main__') {
    for (var i = 1; i < system.args.length; i++) {
        var arg = system.args[i];
        if (arg.indexOf('-') == 0) {
            break;
        }
        system.addRepository(arg);
    }
    log.info('Setup module search: ' + system.getRepositories());
    start();
}
