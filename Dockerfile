FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 AUTO_OPEN=false
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
COPY data ./data
RUN mkdir -p /data
EXPOSE 3000
CMD ["node","server.js"]
