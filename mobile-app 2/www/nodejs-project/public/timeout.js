document.addEventListener('deviceready', function () {
    nodejs.start('server.js', function (err) {
        if (err) console.error(err);
        else console.log("Node started");
    });

    // Check if server is ready
    setTimeout(checkServer, 1000);
}, false);

function checkServer() {
    fetch('http://localhost:3000/api/info')
        .then(res => {
            if (res.ok) {
                // Server is ready, we are already on the "UI" page essentially
                // Just let the current page function as the UI
                console.log("Server ready");

                // Switch fetch calls to absolute URL
                window.fetch = (function (originalFetch) {
                    return function (url, config) {
                        if (url.startsWith('/')) {
                            url = 'http://localhost:3000' + url;
                        }
                        return originalFetch(url, config);
                    };
                })(window.fetch);

                // Re-init UI
                fetchFiles();
            } else {
                setTimeout(checkServer, 1000);
            }
        })
        .catch(() => setTimeout(checkServer, 1000));
}
