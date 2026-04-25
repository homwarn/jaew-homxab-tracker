@echo off
echo ============================================
echo  JAEW HOMXAB - Push to GitHub
echo ============================================
echo.

REM ---- ປ່ຽນ YOUR_GITHUB_USERNAME ເປັນ username ຂອງທ່ານ ----
set GITHUB_USER=homwarn
set REPO_NAME=jaew-homxab-tracker

echo [1/5] git init...
git init
git branch -M main

echo [2/5] git add all files...
git add .

echo [3/5] git commit...
git commit -m "Initial commit: Jaew Homxab Tracker v1.0"

echo [4/5] Add GitHub remote...
git remote add origin https://github.com/%GITHUB_USER%/%REPO_NAME%.git

echo [5/5] Push to GitHub...
echo *** ລະຫັດ: ໃຊ້ Personal Access Token (PAT) ແທນ password ***
git push -u origin main

echo.
echo ============================================
echo  ✅ Done! Check: https://github.com/%GITHUB_USER%/%REPO_NAME%
echo ============================================
pause
