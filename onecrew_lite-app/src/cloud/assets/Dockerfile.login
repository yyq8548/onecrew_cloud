FROM onecrew-cloud-browser:web-login-20261028
COPY --chown=1000:1000 browser-request.mjs /opt/onecrew/request.mjs
COPY --chown=1000:1000 browser-worker.mjs /opt/onecrew/browser-worker.mjs
COPY browser-login-policy.json /etc/chromium/policies/managed/onecrew-login.json
