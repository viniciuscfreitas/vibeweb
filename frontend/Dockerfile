FROM nginx:alpine

RUN apk add --no-cache gettext wget

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /usr/share/nginx/html

COPY index.html.template .
COPY fotos ./fotos

# Ensure css/js from dashboard are still accessible if needed
# Although index.html is replaced, static assets might be useful
COPY css ./css
COPY js ./js

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
