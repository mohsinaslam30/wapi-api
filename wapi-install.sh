#!/bin/bash

# One-click installation script for WhatsCloud API

# Variables
ADMIN_EMAIL="admin.whatscloud.shop"
ADMIN_PASSWORD="mohsinaslam"
ADMIN_NAME="super_admin"
API_DOMAIN="https://crm.whatscloud.shop"
FRONTEND_DOMAIN="https://whatscloud.shop"
ADMIN_DASHBOARD_DOMAIN="https://admin.whatscloud.shop"

# Update package index and install required packages
apt update
apt install -y nginx mongodb-server certbot python3-certbot-nginx pm2

# Set MongoDB credentials
echo "Enter MongoDB username:" 
read MONGO_USER
echo "Enter MongoDB password:" 
read -s MONGO_PASS

# Configure Nginx as reverse proxy for API and frontend
cat <<EOF > /etc/nginx/sites-available/whatscloud
server {
    listen 80;
    server_name $FRONTEND_DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name $API_DOMAIN;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable the Nginx configuration
ln -s /etc/nginx/sites-available/whatscloud /etc/nginx/sites-enabled/

# Obtain SSL certificate from Let's Encrypt
certbot --nginx -d $FRONTEND_DOMAIN -d $API_DOMAIN --non-interactive --agree-tos --email $ADMIN_EMAIL

# Start services with PM2
pm2 start /path/to/your/api/server.js --name "api"  # Change to your API entry file
pm2 start /path/to/your/frontend/server.js --name "frontend"  # Change to your Frontend entry file

# Save PM2 process list
pm2 save

# Show configuration
echo "Installation completed!";
echo "Admin Email: $ADMIN_EMAIL";
echo "Admin Name: $ADMIN_NAME";
echo "API Domain: $API_DOMAIN";
echo "Frontend Domain: $FRONTEND_DOMAIN";
echo "Admin Dashboard Domain: $ADMIN_DASHBOARD_DOMAIN"; 
