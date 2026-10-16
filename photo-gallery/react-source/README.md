# React source (optional — only needed if you want to customize the UI)

The built, ready-to-deploy app is already in `../static/` — you don't need
Node.js on the Pi at all for normal use.

If you want to change the design and rebuild it yourself:

    npm install
    npm run dev       # live preview at localhost:5173, proxies API calls to
                       # a Flask server running on localhost:8080
    npm run build      # outputs to dist/ — copy its contents into ../static/
