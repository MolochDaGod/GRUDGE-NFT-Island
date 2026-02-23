@echo off
echo === GRUDGE VOXEL - Deploy to WSL ===
wsl bash -ic "cd ~/grudge-voxel && bash scripts/deploy-wsl.sh"
pause
