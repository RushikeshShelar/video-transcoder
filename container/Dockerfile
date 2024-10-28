FROM node:18-alpine

RUN apk update && apk upgrade && apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm install

# Copy all TypeScript files
COPY . .

# Build the project
RUN npm run build

# Copy built files to the final image (dist)
COPY dist/index.js ./

CMD ["npm", "run", "start:prod"]
