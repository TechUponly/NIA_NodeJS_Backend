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
                        rsync -avz --delete \
                            --exclude 'node_modules' \
                            --exclude '.git' \
                            --exclude '.env' \
                            --exclude 'logs' \
                            --exclude '*.log' \
                            --exclude 'Announcement/*' \
                            --exclude 'admin/Upload/*' \
                            --exclude 'admin/leave_docs/*' \
                            --exclude 'uploads/*' \
                            ./ ${DEPLOY_USER}@${DEPLOY_SERVER}:${DEPLOY_PATH}/
                        
                        echo "✓ Files deployed successfully"
                    '''
                }
            }
        }
        
        stage('Create Required Directories') {
            steps {
                echo '✓ Creating required directories...'
                sshagent(credentials: ['azure-uat-ssh']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_SERVER} "
                            cd ${DEPLOY_PATH}
                            
                            # Create all required directories
                            mkdir -p logs
                            mkdir -p Announcement
                            mkdir -p admin/Upload
                            mkdir -p admin/leave_docs
                            mkdir -p uploads/leave_docs
                            
                            # Set proper permissions
                            chmod 755 Announcement admin/Upload admin/leave_docs uploads/leave_docs
                            
                            echo '✓ All directories created'
                        "
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
# Node Environment
NODE_ENV=production
PORT=3002
HOST=0.0.0.0

# MySQL Database Configuration (Docker container: mysql-uat)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=nia_hrms_uat
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD_HERE

# JWT Configuration
JWT_SECRET=nia_hrms_uat_secret_key_change_this_to_something_secure_32_chars_minimum
JWT_EXPIRES_IN=24h

# Application URLs
APP_URL=https://uponly.duckdns.org/nia_hrms_uat/api
FRONTEND_URL=https://uponly.duckdns.org/nia_hrms_uat

# CORS Configuration
CORS_ORIGIN=https://uponly.duckdns.org

# Logging
LOG_LEVEL=info

# Email Configuration (if needed)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASSWORD=your-app-password
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
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_SERVER} "
                            cd ${DEPLOY_PATH}
                            npm ci --production
                            echo '✓ Dependencies installed'
                        "
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
                                pm2 start src/app.js --name nia-hrms-backend-uat \
                                    --instances 2 \
                                    --max-memory-restart 500M \
                                    --env production
                                pm2 save
                            fi
                            
                            # Show status
                            echo ""
                            echo "==================================="
                            pm2 list
                            echo "==================================="
                            echo ""
                            
                            # Wait for app to start
                            sleep 3
                            
                            # Show logs
                            pm2 logs nia-hrms-backend-uat --lines 30 --nostream
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
                        # Check if application is running on port 3002
                        echo "Checking local port 3002..."
                        response_local=$(curl -s -o /dev/null -w "%{http_code}" http://4.240.113.245:3002/ || echo "000")
                        echo "Local response: $response_local"
                        
                        # Check through Nginx
                        echo "Checking through Nginx..."
                        response_nginx=$(curl -s -o /dev/null -w "%{http_code}" https://uponly.duckdns.org/nia_hrms_uat/api/ || echo "000")
                        echo "Nginx response: $response_nginx"
                        
                        if [ "$response_local" = "200" ] || [ "$response_nginx" = "200" ]; then
                            echo "✓ Application is running successfully"
                        else
                            echo "⚠ WARNING: Application may not be responding properly"
                            echo "Local: $response_local, Nginx: $response_nginx"
                        fi
                    '''
                }
            }
        }
    }
    
    post {
        success {
            echo '===================================='
            echo '✓ BACKEND DEPLOYMENT SUCCESSFUL!'
            echo '===================================='
            echo 'Application: nia-hrms-backend-uat'
            echo 'Location: /var/www/html/public_html/nia_hrms_backend_uat'
            echo 'Entry Point: src/app.js'
            echo 'Port: 3002'
            echo ''
            echo 'URLs:'
            echo '  Direct: http://4.240.113.245:3002/'
            echo '  Public: https://uponly.duckdns.org/nia_hrms_uat/api/'
            echo ''
            echo 'Check logs: pm2 logs nia-hrms-backend-uat'
            echo '===================================='
        }
        failure {
            echo '===================================='
            echo '✗ BACKEND DEPLOYMENT FAILED!'
            echo '===================================='
            echo 'Check Jenkins console output for errors'
            echo 'SSH to server and check:'
            echo '  pm2 logs nia-hrms-backend-uat'
            echo '  cat /var/www/html/public_html/nia_hrms_backend_uat/.env'
        }
        always {
            cleanWs()
        }
    }
}
