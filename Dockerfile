FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 pvr && adduser --system --uid 1001 --ingroup pvr pvr
COPY --from=build --chown=pvr:pvr /app/.next/standalone ./
COPY --from=build --chown=pvr:pvr /app/.next/static ./.next/static
COPY --from=build --chown=pvr:pvr /app/public ./public
USER pvr
EXPOSE 3000
CMD ["node", "server.js"]
