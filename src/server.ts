import app from "./app.js";
import appConfig from "./config/app.config.js";

const PORT = appConfig.PORT;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});