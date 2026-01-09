const { Pool } = require("pg");
const express = require("express");
const path = require("path");
const session = require("express-session");
const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");

const app = express();
const PORT = 3000;

// -------------------- MIDDLEWARE --------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "athena_secret_key",
    resave: false,
    saveUninitialized: false
  })
);

app.use(express.static("public"));

// -------------------- DATABASE --------------------
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "athena_ide",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || 5432
});

// -------------------- AUTH PROTECTION --------------------
app.get("/dashboard.html", (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }
  next();
});

// -------------------- ROUTES --------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -------------------- REGISTER --------------------
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, password]
    );
    res.send("User registered successfully");
  } catch (err) {
    res.send("Error registering user");
  }
});

// -------------------- LOGIN --------------------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND password = $2",
      [username, password]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      req.session.user = { id: user.id, username: user.username };
      res.redirect("/dashboard.html");
    } else {
      res.send("Invalid username or password");
    }
  } catch {
    res.send("Login error");
  }
});

// -------------------- SAVE / UPDATE FILE (NO DUPLICATES) --------------------
app.post("/files", async (req, res) => {
  if (!req.session.user) return res.status(401).send("Not logged in");

  const { id, filename, language, code } = req.body;
  const userId = req.session.user.id;

  try {
    if (id) {
      await pool.query(
        `
        UPDATE files
        SET filename = $1, code = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND user_id = $4
        `,
        [filename, code, id, userId]
      );
      res.json({ message: "File updated", id });
    } else {
      const result = await pool.query(
        `
        INSERT INTO files (user_id, filename, language, code)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [userId, filename, language, code]
      );
      res.json({ message: "File created", id: result.rows[0].id });
    }
  } catch {
    res.status(500).send("Error saving file");
  }
});

// -------------------- RECENT FILES (DASHBOARD) --------------------
app.get("/files", async (req, res) => {
  if (!req.session.user) return res.status(401).send("Not logged in");

  try {
    const result = await pool.query(
      `
      SELECT id, filename, language, updated_at
      FROM files
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 6
      `,
      [req.session.user.id]
    );
    res.json(result.rows);
  } catch {
    res.status(500).send("Error fetching files");
  }
});

// -------------------- FILES BY LANGUAGE (SIDEBAR) --------------------
app.get("/files/:language", async (req, res) => {
  if (!req.session.user) return res.status(401).send("Not logged in");

  try {
    const result = await pool.query(
      `
      SELECT id, filename, updated_at
      FROM files
      WHERE user_id = $1 AND language = $2
      ORDER BY updated_at DESC
      `,
      [req.session.user.id, req.params.language]
    );
    res.json(result.rows);
  } catch {
    res.status(500).send("Error fetching files");
  }
});

// -------------------- LOAD SINGLE FILE --------------------
app.get("/file/:id", async (req, res) => {
  if (!req.session.user) return res.status(401).send("Not logged in");

  try {
    const result = await pool.query(
      `
      SELECT id, filename, language, code
      FROM files
      WHERE id = $1 AND user_id = $2
      `,
      [req.params.id, req.session.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("File not found");
    }

    res.json(result.rows[0]);
  } catch {
    res.status(500).send("Error loading file");
  }
});

// -------------------- DELETE FILE --------------------
app.delete("/file/:id", async (req, res) => {
  if (!req.session.user) return res.status(401).send("Not logged in");

  try {
    await pool.query(
      "DELETE FROM files WHERE id = $1 AND user_id = $2",
      [req.params.id, req.session.user.id]
    );
    res.send("File deleted");
  } catch {
    res.status(500).send("Error deleting file");
  }
});

// -------------------- RUN PYTHON CODE (FIXED) --------------------
app.post("/run-python", (req, res) => {
  if (!req.session.user) {
    return res.json({ output: "Not logged in" });
  }

  const code = req.body.code;
  if (!code) return res.json({ output: "No code provided" });

  // Create temp python file
  const tempFile = path.join(os.tmpdir(), `athena_${Date.now()}.py`);
  fs.writeFileSync(tempFile, code);

  // IMPORTANT FIX: python3 (not python)
  exec(`python3 "${tempFile}"`, (error, stdout, stderr) => {
    fs.unlinkSync(tempFile);

    if (error) {
      return res.json({ output: stderr || error.message });
    }
    res.json({ output: stdout || "Executed successfully" });
  });
});

// -------------------- LOGOUT --------------------
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/index.html");
  });
});

// -------------------- START SERVER --------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
