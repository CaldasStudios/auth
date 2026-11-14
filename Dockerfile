FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY scripts ./scripts
COPY llms.txt ./
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run migrate && npm start"]
