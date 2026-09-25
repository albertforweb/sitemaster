FROM node:22-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY authorization-manifest.json ./authorization-manifest.json
COPY public ./public

ENV NODE_ENV=production \
    PORT=5000 \
    SITEMASTER_DB_PATH=/var/lib/sitemaster/sitemaster.db \
    SITEMASTER_DEPLOYMENTS_DIR=/var/lib/sitemaster-deployments

RUN mkdir -p /var/lib/sitemaster /var/lib/sitemaster-deployments && \
    chown -R node:node /app /var/lib/sitemaster /var/lib/sitemaster-deployments
USER node
VOLUME ["/var/lib/sitemaster", "/var/lib/sitemaster-deployments"]
EXPOSE 5000
HEALTHCHECK --interval=5s --timeout=3s --retries=20 CMD node -e "fetch('http://127.0.0.1:5000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
