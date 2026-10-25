@echo off
cd /d "C:\Websites\sitemaster\"
set SITEMASTER_PUBLIC_BASE_URL=http://localhost:5000
set IAM_AUTHORIZATION_URL=http://localhost:3000/oauth/authorize
set IAM_TOKEN_URL=http://localhost:3000/oauth/token
set IAM_INTROSPECT_URL=http://localhost:3000/oauth/introspect
set IAM_VAULTS_FILE=C:\Websites\iam\.vaults
npm start