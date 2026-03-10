document.addEventListener('deviceready', function () {
    console.log("Device Ready");

    // Start nodejs
    nodejs.start('server.js', function (err) {
        if (err) console.error("Node error:", err);
        else console.log("Node started");
    });

    // Override fetch to use absolute path
    const originalFetch = window.fetch;
    window.fetch = function (url, options) {
        if (url.startsWith('/')) {
            url = 'http://localhost:3000' + url;
        }
        return originalFetch(url, options);
    };

    // Override actions
    window.location.host = "localhost:3000"; // Trick

    // Poll for server
    const interval = setInterval(() => {
        fetch('http://localhost:3000/api/info')
            .then(res => {
                if (res.ok) {
                    clearInterval(interval);
                    console.log("Server detected, reloading UI data");
                    // Trigger existing UI functions
                    if (window.fetchFiles) window.fetchFiles();
                    if (window.fetchQr) window.fetchQr();
                    if (window.checkTunnelStatus) window.checkTunnelStatus();
                }
            })
            .catch(e => console.log("Waiting for server..."));
    }, 1000);
}, false);
