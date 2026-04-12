module.exports = {
  apps: [{
    name: 'aipulse',
    script: './backend/dist/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }],
};
