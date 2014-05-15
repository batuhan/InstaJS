/**
 * InstaJS is a micro-library that lets you integrate your JavaScript application with Instagram.
 * InstaJS works for both BROWSER-BASED apps and CORDOVA/PHONEGAP apps.
 * This library has no dependency. You don't need jQuery or anything else.
 * InstaJS allows you to login to Instagram and execute any Instagram API request.
 * Most (nearly all) of this code is from Christophe Coenraets's OpenFB project.
 * @author Batuhan Icoz <i@bt.hn> twitter.com/batuhanicoz github.com/batuhan
 * @license MIT
 * @version 0.1
 */

var instaJS = (function() {

    var IG_LOGIN_URL = 'http://localhost:3000/go',

        // By default we store igtoken in sessionStorage. This can be overriden in init()
        tokenStore = window.sessionStorage,

        igAppId,
        oauthRedirectURL,

        // Because the OAuth login spans multiple processes, we need to keep the success/error handlers as variables
        // inside the module instead of keeping them local within the login function.
        loginSuccessHandler,
        loginErrorHandler,

        // Indicates if the app is running inside Cordova
        runningInCordova,

        // Used in the exit event handler to identify if the login has already been processed elsewhere (in the oauthCallback function)
        loginProcessed;

    document.addEventListener("deviceready", function() {
        runningInCordova = true;
    }, false);

    /**
     * Initialize the InstaJS module. You must use this function and initialize the module with an appId before you can
     * use any other function.
     * @param appId - The ID of the Instagram app
     * @param redirectURL - The OAuth redirect URL. Optional. If not provided, we use sensible defaults.
     * @param store - The store used to save the Instagram token. Optional. If not provided, we use sessionStorage.
     */
    function init(appId, redirectURL, store) {
        igAppId = appId;
        if (redirectURL) oauthRedirectURL = redirectURL;
        if (store) tokenStore = store;
    }

    /**
     * Login to Instagram using OAuth. If running in a Browser, the OAuth workflow happens in a a popup window.
     * If running in Cordova container, it happens using the In-App Browser. Don't forget to install the In-App Browser
     * plugin in your Cordova project: cordova plugins add org.apache.cordova.inappbrowser.
     * @param scope - The set of Instagram permissions requested
     * @param success - Callback function to invoke when the login process succeeds
     * @param error - Callback function to invoke when the login process fails
     * @returns {*}
     */
    function login(scope, success, error) {

        if (!igAppId) {
            return error({
                error: 'Instagram App ID is not set!'
            });
        }

        var loginWindow;

        scope = scope || '';

        loginSuccessHandler = success;
        loginErrorHandler = error;

        loginProcessed = false;
        logout();

        // Check if an explicit oauthRedirectURL has been provided in init(). If not, infer the appropriate value
        if (!oauthRedirectURL) {
            if (runningInCordova) {
                oauthRedirectURL = 'https://www.facebook.com/connect/login_success.html';
            } else {
                // Trying to calculate oauthRedirectURL based on the current URL.
                var index = document.location.href.indexOf('index.html');
                if (index > 0) {
                    oauthRedirectURL = window.document.location.href.substring(0, index) + 'oauthcallback.html';
                    console.log(oauthRedirectURL);
                } else {
                    return alert("Can't reliably infer the OAuth redirect URI. Please specify it explicitly in instaJS.init()");
                }
            }
        }

        loginWindow = window.open(IG_LOGIN_URL + '?client_id=' + igAppId + '&redirect_uri=' + oauthRedirectURL +
            '&response_type=token&display=popup&scope=' + scope, '_blank', 'location=no');

        // If the app is running in Cordova, listen to URL changes in the InAppBrowser until we get a URL with an access_token or an error
        if (runningInCordova) {
            loginWindow.addEventListener('loadstart', function(event) {
                var url = event.url;
                if (url.indexOf("access_token=") > 0 || url.indexOf("error=") > 0) {
                    loginWindow.close();
                    oauthCallback(url);
                }
            });

            loginWindow.addEventListener('exit', function() {
                // Handle the situation where the user closes the login window manually before completing the login process
                if (!loginProcessed) {
                    loginErrorHandler({
                        error: 'user_cancelled',
                        error_description: 'User cancelled login process',
                        error_reason: "user_cancelled"
                    });
                }
            });
        }
        // Note: if the app is running in the browser the loginWindow dialog will call back by invoking the
        // oauthCallback() function. See oauthcallback.html for details.

    }

    /**
     * Called either by oauthcallback.html (when the app is running the browser) or by the loginWindow loadstart event
     * handler defined in the login() function (when the app is running in the Cordova/PhoneGap container).
     * @param url - The oautchRedictURL called by Facebook with the access_token in the querystring at the ned of the
     * OAuth workflow.
     */
    function oauthCallback(url) {
        // Parse the OAuth data received from Facebook
        var queryString,
            obj;

        loginProcessed = true;
        if (url.indexOf("access_token=") > 0) {
            queryString = url.substr(url.indexOf('#') + 1);
            obj = parseQueryString(queryString);
            tokenStore['igtoken'] = obj['access_token'];
            if (loginSuccessHandler) loginSuccessHandler();
        } else if (url.indexOf("error=") > 0) {
            queryString = url.substring(url.indexOf('?') + 1, url.indexOf('#'));
            obj = parseQueryString(queryString);
            if (loginErrorHandler) loginErrorHandler(obj);
        } else {
            if (loginErrorHandler) loginErrorHandler();
        }
    }

    /**
     * Application-level logout: we simply discard the token.
     */
    function logout() {
        tokenStore['igtoken'] = undefined;
    }


    /**
     * Helper function for JSONP requests 'cause fucking Instagram API don't have CORS
     */

    function jsonp(url, callback) {
        console.log(url)
        var callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
        window[callbackName] = function(data) {
            delete window[callbackName];
            document.body.removeChild(script);
            callback(data.data);
        };

        var script = document.createElement('script');
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
        document.body.appendChild(script);
    }

    /**
     * Lets you make any Instagram API request.
     * @param obj - Request configuration object. Can include:
     *  method:  HTTP method: GET, POST, etc. Optional - Default is 'GET'
     *  path:    path in the Instagram API: /users/self/feed, /users/self, etc. - Required
     *  params:  queryString parameters as a map - Optional
     *  success: callback function when operation succeeds - Optional
     *  error:   callback function when operation fails - Optional
     */

    function api(obj) {

        var method = obj.method || 'GET',
            params = obj.params || {},
            url;

        params['access_token'] = tokenStore['igtoken'];

        url = 'https://api.instagram.com/v1' + obj.path + '?' + toQueryString(params);

        if (method === 'GET') {
            jsonp(url, function(data) {
                if (obj.success) obj.success(data);
            });
        } else {
            var xhr = new XMLHttpRequest();

            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        if (obj.success) obj.success(JSON.parse(xhr.responseText));
                    } else {
                        var error = xhr.responseText ? JSON.parse(xhr.responseText).error : {
                            message: 'An error has occurred'
                        };
                        if (obj.error) obj.error(error);
                    }
                }
            };

            xhr.open(method, url, true);
            xhr.send();
        }

    }

    function parseQueryString(queryString) {
        var qs = decodeURIComponent(queryString),
            obj = {},
            params = qs.split('&');
        params.forEach(function(param) {
            var splitter = param.split('=');
            obj[splitter[0]] = splitter[1];
        });
        return obj;
    }

    function toQueryString(obj) {
        var parts = [];
        for (var i in obj) {
            if (obj.hasOwnProperty(i)) {
                parts.push(encodeURIComponent(i) + "=" + encodeURIComponent(obj[i]));
            }
        }
        return parts.join("&");
    }


    // The public API
    return {
        init: init,
        login: login,
        logout: logout,
        api: api,
        oauthCallback: oauthCallback
    }

}());