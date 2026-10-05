module.exports = {
    apps: [{
        name: "capes",
        script: "dist/index.js",
        args: ["--color", "--time"],
        time: true,
        interpreter: "node@22.23.3",
        max_memory_restart: "200M"
    }]
}
