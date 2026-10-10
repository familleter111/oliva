# Oliva : un seul serveur Node, un seul processus, un disque persistant monté sur /data.
# Les dépendances de développement restent dans l'image : les commandes d'exploitation
# (admin:init, storage:verifier, storage:restaurer) doivent pouvoir être lancées dans le conteneur.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    OLIVA_STORAGE_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Le serveur tourne sans privilèges et n'écrit que dans le volume.
RUN useradd --uid 1001 --create-home oliva && mkdir -p /data /app/.next/cache && chown -R oliva:oliva /data /app/.next/cache
USER oliva

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
