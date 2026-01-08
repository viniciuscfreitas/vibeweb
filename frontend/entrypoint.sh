#!/bin/sh

set -e

if [ ! -f /usr/share/nginx/html/index.html.template ]; then
    echo "Error: index.html.template not found"
    exit 1
fi

export DOMAIN=${DOMAIN:-vibe-web.com}
export PIXEL_ID=${PIXEL_ID:-YOUR_PIXEL_ID}
export WHATSAPP_NUMBER=${WHATSAPP_NUMBER:-5562994584520}

# Grug check: Don't deploy with localhost domain
if [ "$DOMAIN" = "localhost" ] || [ "$DOMAIN" = "127.0.0.1" ]; then
    echo "⚠️  Warning: DOMAIN is set to $DOMAIN. SEO might be affected."
fi

# Simplified envsubst (replaces all defined env vars in template)
envsubst < /usr/share/nginx/html/index.html.template > /usr/share/nginx/html/index.html

exec "$@"

