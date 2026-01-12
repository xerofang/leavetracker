# Use Node.js LTS
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "app.js"]
