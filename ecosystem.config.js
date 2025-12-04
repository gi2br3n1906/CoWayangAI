module.exports = {
    apps: [
        {
            name: 'nodejs-api',
            script: './backend/index.js',
            cwd: '/var/www/CoWayangAI',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            },
            error_file: './logs/nodejs-api-error.log',
            out_file: './logs/nodejs-api-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
        },
        {
            name: 'asr-service',
            script: '/var/www/CoWayangAI/asrllmserve/start_asr.sh',
            cwd: '/var/www/CoWayangAI/asrllmserve',
            interpreter: '/bin/bash',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '2G',
            error_file: '/var/www/CoWayangAI/logs/asr-service-error.log',
            out_file: '/var/www/CoWayangAI/logs/asr-service-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
        }
    ]
};
