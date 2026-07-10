module.exports = {
  apps: [
    {
      name: "yopips-terminal",
      cwd: "/opt/yopips-terminal/current",
      script: "./scripts/start-production.sh",
      interpreter: "/bin/bash",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 15000,
      listen_timeout: 15000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
