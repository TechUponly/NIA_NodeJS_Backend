pipeline {
    agent any
    
    environment {
        DEPLOY_PATH = '/var/www/html/public_html/NAS_HRMS_BACKEND_QA'
    }
    
    stages {
        stage('Clean Workspace') {
            steps {
                cleanWs()
            }
        }
        
        stage('Checkout') {
            steps {
                git branch: 'newagesecure-qa',
                    credentialsId: 'github-credentials',
                    url: 'https://github.com/TechUponly/NIA_NodeJS_Backend.git'
            }
        }
        
        stage('Install Dependencies') {
            steps {
                script {
                    sh '''
                        echo "Node version: $(node --version)"
                        echo "NPM version: $(npm --version)"
                        
                        if [ -f "package-lock.json" ]; then
                            npm ci --production
                        else
                            npm install --production
                        fi
                    '''
                }
            }
        }
        
        stage('Backup') {
            steps {
                script {
                    sh '''
                        if [ -d "${DEPLOY_PATH}" ] && [ "$(ls -A ${DEPLOY_PATH})" ]; then
                            TIMESTAMP=$(date +%Y%m%d_%H%M%S)
                            sudo cp -r ${DEPLOY_PATH} ${DEPLOY_PATH}_backup_${TIMESTAMP}
                            echo "Backup created: ${DEPLOY_PATH}_backup_${TIMESTAMP}"
                        fi
                    '''
                }
            }
        }
        
        stage('Deploy') {
            steps {
                script {
                    sh '''
                        # Create directories
                        sudo mkdir -p ${DEPLOY_PATH}/logs
                        sudo mkdir -p ${DEPLOY_PATH}/uploads
                        
                        # Copy files
                        sudo rsync -av --exclude='node_modules' --exclude='.git' --exclude='*.log' ./ ${DEPLOY_PATH}/
                        sudo cp -r node_modules ${DEPLOY_PATH}/
                        
                        # Set permissions
                        sudo chown -R jenkins:jenkins ${DEPLOY_PATH}
                        sudo chmod -R 755 ${DEPLOY_PATH}
                        sudo chmod -R 775 ${DEPLOY_PATH}/uploads
                        sudo chmod -R 775 ${DEPLOY_PATH}/logs
                        
                        echo "✓ Backend deployed to ${DEPLOY_PATH}"
                    '''
                }
            }
        }
        
        stage('Cleanup Old Backups') {
            steps {
                script {
                    sh '''
                        cd /var/www/html/public_html/
                        sudo ls -t NAS_HRMS_BACKEND_QA_backup_* 2>/dev/null | tail -n +6 | xargs -r sudo rm -rf
                    '''
                }
            }
        }
    }
    
    post {
        success {
            cleanWs()
            echo '''
            ============================================
            ✓ BACKEND DEPLOYED SUCCESSFULLY
            ============================================
            
            NEXT STEP: Restart PM2 manually
            
            SSH to server and run:
            pm2 restart nas-hrms-qa-backend
            
            Or if first time:
            cd /var/www/html/public_html/NAS_HRMS_BACKEND_QA
            pm2 start ecosystem.config.js
            pm2 save
            ============================================
            '''
        }
        failure {
            echo 'Deployment failed! Attempting rollback...'
            script {
                sh '''
                    cd /var/www/html/public_html/
                    LATEST_BACKUP=$(sudo ls -t NAS_HRMS_BACKEND_QA_backup_* 2>/dev/null | head -n1)
                    if [ ! -z "$LATEST_BACKUP" ]; then
                        sudo rm -rf ${DEPLOY_PATH}
                        sudo cp -r $LATEST_BACKUP ${DEPLOY_PATH}
                        echo "Rollback completed"
                    fi
                '''
            }
        }
    }
}
