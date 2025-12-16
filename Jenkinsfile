pipeline {
    agent any
    
    tools {
        nodejs 'NodeJS-18'
    }
    
    environment {
        DEPLOY_PATH = '/var/www/html/NIA_NodeJS_Backend'
        PM2_APP_NAME = 'app'
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Deploy') {
            steps {
                sh '''
                    pm2 stop ${PM2_APP_NAME} || true
                    
                    sudo mkdir -p ${DEPLOY_PATH}
                    sudo rsync -av --delete --exclude node_modules --exclude .git --exclude .env ./ ${DEPLOY_PATH}/
                    
                    cd ${DEPLOY_PATH}
                    sudo npm ci --production
                    sudo chown -R www-data:www-data ${DEPLOY_PATH}
                '''
            }
        }
        
        stage('Start') {
            steps {
                sh '''
                    cd ${DEPLOY_PATH}
                    pm2 restart ${PM2_APP_NAME} || pm2 start src/app.js --name ${PM2_APP_NAME}
                    pm2 save
                '''
            }
        }
    }
    
    post {
        success { echo 'Backend deployed successfully!' }
        failure { echo 'Deployment failed!' }
        always { cleanWs() }
    }
}
