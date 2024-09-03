/*this file is called server.js
 * its where we create the Express server
 * this file loads all routes from the file routes/index.js
 */

const express = require('express');
const app = express();
const routes = require('./routes');

const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use('/api', routes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
