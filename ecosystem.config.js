module.exports = {
    apps: [
        {
            name: 'nodejs-api',
            script: './backend/index.js',
            cwd: './backend',
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
            name: 'cowayang-ai-backend',
            script: './backend-ai/venv/bin/python',
            args: 'main.py',
            cwd: './backend-ai',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '2G',
            interpreter: 'none',
            error_file: './logs/ai-backend-error.log',
            out_file: './logs/ai-backend-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
        },
        {
            name: 'cowayang-ai-asr',
            script: './backend-ai/venv/bin/python',
            args: 'asr_server.py',
            cwd: './backend-ai',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '2G',
            interpreter: 'none',
            error_file: './logs/asr-server-error.log',
            out_file: './logs/asr-server-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
        }
    ]
};
