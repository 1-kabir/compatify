const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const { features } = require("web-features");

dotenv.config({ path: ".env.local" });
const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// ✅ List all available feature keys
app.get("/features", (req, res) => {
  const keys =
    typeof features.get === "function"
      ? [...features.keys()]
      : Object.keys(features);

  res.json({ count: keys.length, keys });
});

// ✅ Show details about a specific feature
app.get("/features/:id", (req, res) => {
  const { id } = req.params;
  const entry =
    typeof features.get === "function" ? features.get(id) : features[id];

  if (!entry) {
    return res.status(404).json({ error: `Feature '${id}' not found` });
  }

  res.json(entry);
});

// Root health check
app.get("/", (req, res) =>
  res.json({ message: "Baseline Backend API is running" })
);

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
