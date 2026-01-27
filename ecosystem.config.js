module.exports = {
  apps: [{
    name: 'nas-hrms-qa-backend',
    script: 'server.js',  // Change to your main file (index.js, app.js, etc.)
    cwd: '/var/www/html/public_html/NAS_HRMS_BACKEND_QA',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 4001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
