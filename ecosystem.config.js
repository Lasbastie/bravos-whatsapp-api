// PM2 ecosystem config — Bravos WhatsApp API
// Uso: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: process.env.CLIENT_ID || 'bravos-whatsapp-api',
      script: 'src/server.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      kill_timeout: 15000, // Tempo pro graceful shutdown fechar o Chrome
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
