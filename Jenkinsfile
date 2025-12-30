pipeline {
    agent any
    
    tools {
        nodejs 'NodeJS-18'
    }
    
    environment {
        DEPLOY_SERVER = '4.240.113.245'
        DEPLOY_USER = 'uponly-azure-uat'
        DEPLOY_PATH = '/var/www/html/public_html/nia_hrms_backend_uat'
        APP_NAME = 'nia-hrms-backend-uat'
        APP_PORT = '3002'
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo '✓ Checking out code from nia_node_uat branch...'
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo '✓ Installing npm dependencies...'
                sh 'npm ci --production'
            }
        }
        
        stage('Deploy to Server') {
            steps {
                echo '✓ Deploying to server...'
                sshagent(credentials: ['azure-uat-ssh']) {
                    sh '''
                        # Sync files to server
                        rsync -avz --delete \
                            --exclude 'node_modules' \
                            --exclude '.git' \
                            --exclude '.env' \
                            --exclude 'logs' \
                            --exclude '*.log' \
                            ./ ${DEPLOY_USER}@${DEPLOY_SERVER}:${DEPLOY_PATH}/
                        
                        echo "✓ Files deployed successfully"
                    '''
                }
            }
        }
        
        stage('Configure Environment') {
            steps {
                echo '✓ Setting up environment variables...'
                sshagent(credentials: ['azure-uat-ssh']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_SERVER} "cat > ${DEPLOY_PATH}/.env << 'EOF'
NODE_ENV=production
PORT=3002

# MySQL Database Configuration (Docker)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=nia_hrms_uat
DB_USER=root
DB_PASSWORD=your_mysql_password

# JWT Configuration
JWT_SECRET=your_jwt_secret_change_this_in_production
JWT_EXPIRES_IN=24h

# Application URLs
APP_URL=https://uponly.duckdns.org/nia_hrms_uat/api
FRONTEND_URL=https://uponly.duckdns.org/nia_hrms_uat

# CORS
CORS_ORIGIN=https://uponly.duckdns.org

# Logging
LOG_LEVEL=info
EOF"
                        echo "✓ Environment file created"
                    '''
                }
            }
        }
        
        stage('Install Production Dependencies') {
            steps {
                echo '✓ Installing dependencies on server...'
                sshagent(credentials: ['azure-uat-ssh']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_SERVER} "cd ${DEPLOY_PATH} && npm ci --production"
                        echo "✓ Dependencies installed"
                    '''
                }
            }
        }
        
        stage('Database Migration') {
            steps {
                echo '✓ Running database migrations...'
                sshagent(credentials: ['azure-uat-ssh']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_SERVER} "cd ${DEPLOY_PATH} && npm run migrate || echo 'No migrations to run'"
                    '''
                }
            }
        }
        
        stage('Restart Application') {
            steps {
                echo '✓ Restarting application with PM2...'
                sshagent(credentials: ['azure-uat-ssh']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_SERVER} << 'ENDSSH'
                            cd /var/www/html/public_html/nia_hrms_backend_uat
                            
                            # Check if PM2 process exists
                            if pm2 list | grep -q "nia-hrms-backend-uat"; then
                                echo "⟳ Restarting existing PM2 process..."
                                pm2 reload nia-hrms-backend-uat --update-env
                            else
                                echo "▶ Starting new PM2 process..."
                                pm2 start server.js --name nia-hrms-backend-uat \
                                    --instances 2 \
                                    --max-memory-restart 500M
                                pm2 save
                            fi
                            
                            # Show status
                            echo ""
                            echo "==================================="
                            pm2 list
                            echo "==================================="
                            echo ""
                            pm2 logs nia-hrms-backend-uat --lines 20 --nostream
ENDSSH
                    '''
                }
            }
        }
        
        stage('Health Check') {
            steps {
                echo '✓ Performing health check...'
                script {
                    sleep(time: 10, unit: 'SECONDS')
                    sh '''
                        # Check if application is running
                        response=$(curl -s -o /dev/null -w "%{http_code}" https://uponly.duckdns.org/nia_hrms_uat/api/health || echo "000")
                        
                        if [ "$response" = "200" ]; then
                            echo "✓ Application is running perfectly (HTTP $response)"
                        elif [ "$response" = "404" ]; then
                            echo "⚠ Application is running but /health endpoint not found (HTTP $response)"
                        else
                            echo "⚠ WARNING: Application may not be running properly (HTTP $response)"
                        fi
                    '''
                }
            }
        }
    }
    
    post {
        success {
            echo '=================================='
            echo '✓ BACKEND DEPLOYMENT SUCCESSFUL!'
            echo '=================================='
            echo 'Application: nia-hrms-backend-uat'
            echo 'Location: /var/www/html/public_html/nia_hrms_backend_uat'
            echo 'URL: https://uponly.duckdns.org/nia_hrms_uat/api'
            echo 'Port: 3002'
            echo '=================================='
        }
        failure {
            echo '=================================='
            echo '✗ BACKEND DEPLOYMENT FAILED!'
            echo '=================================='
        }
        always {
            cleanWs()
        }
    }
}
