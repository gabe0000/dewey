FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node docs ./docs
COPY --chown=node:node starter ./starter
USER node
ENV HOST=0.0.0.0 PORT=8080 DEWEY_SOURCES=/sources DEWEY_INDEX=/index
EXPOSE 8080
CMD ["node", "src/server.mjs"]
