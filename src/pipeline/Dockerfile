FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package files from the project root build context
COPY package*.json ./

# Install dependencies based on the root package.json
# Relying on npm install here, assuming it resolves dependencies correctly in this context
RUN npm install --production
RUN npm install tsx

# Copy relevant source code for the pipeline worker
COPY src/pipeline/ ./src/pipeline/
COPY src/workflow/ ./src/workflow/
COPY src/worker/   ./src/worker/
COPY audio/        ./audio/
COPY src/shared/   ./src/shared/

# Assuming the main entry point for the worker service will be index.ts in this directory
CMD ["tsx", "src/pipeline/index.ts"]
