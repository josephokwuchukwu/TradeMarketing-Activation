# Trade Activate API. One image, run as many copies as you like (server 1, 2, 3 ...).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "src/index.js"]
