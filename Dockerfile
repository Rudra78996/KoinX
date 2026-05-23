# Use lightweight official Node 20 Alpine image
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package definition files
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy the rest of the application files (including tsconfig.json and src/)
COPY . .

# Compile TypeScript to JavaScript inside the dist/ directory
RUN npm run build

# Expose application port
EXPOSE 3000

# Start command (runs node dist/server.js)
CMD ["npm", "start"]
