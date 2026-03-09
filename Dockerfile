FROM node:18-bullseye-slim

# Install C++ build tools needed by raknet-native
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "afkbot-bedrock.js"]
