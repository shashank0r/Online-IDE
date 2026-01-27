let currentFileId = null;
document.getElementById("newFileBtn").onclick = () => {
  currentFileId = null;                 //  reset ID
  document.getElementById("filename").value = "";
  editor.setValue("");
};

document.getElementById("newFileBtn").onclick = () => {
  currentFileId = null;                 //  reset ID
  document.getElementById("filename").value = "";
  editor.setValue("");
};

// =======================
// THEME SETUP
// =======================
const savedTheme = localStorage.getItem("editorTheme") || "light";

const editor = CodeMirror.fromTextArea(
  document.getElementById("code"),
  {
    lineNumbers: true,
    mode: language === "py" ? "python" : "javascript",
    theme: savedTheme === "dark" ? "dracula" : "default"
  }
);

if (savedTheme === "dark") {
  document.body.classList.add("dark");
  document.getElementById("themeToggle").innerText = "Light Mode";
}

document.getElementById("themeToggle").onclick = () => {
  const dark = document.body.classList.toggle("dark");
  editor.setOption("theme", dark ? "dracula" : "default");
  document.getElementById("themeToggle").innerText =
    dark ? "Light Mode" : "Dark Mode";
  localStorage.setItem("editorTheme", dark ? "dark" : "light");
};

// =======================
// LOAD FILES INTO SIDEBAR
// =======================
fetch(`/files/${language === "py" ? "python" : "javascript"}`)
  .then(res => res.json())
  .then(files => {
    const list = document.getElementById("fileList");
    list.innerHTML = "";

    if (files.length === 0) {
      list.innerHTML = '<li class="list-group-item">No files</li>';
      return;
    }

    files.forEach(file => {
      const li = document.createElement("li");
      li.className =
        "list-group-item d-flex justify-content-between align-items-center";

      li.innerHTML = `
        <span style="cursor:pointer">${file.filename}</span>
        <button class="btn btn-sm btn-danger">X</button>
      `;

      li.children[0].onclick = () => loadFile(file.id);
      li.children[1].onclick = () => deleteFile(file.id);

      list.appendChild(li);
    });
  });

// =======================
// LOAD SINGLE FILE
// =======================
function loadFile(id) {
  fetch(`/file/${id}`)
    .then(res => res.json())
    .then(file => {
      currentFileId = file.id;
      document.getElementById("filename").value = file.filename;
      editor.setValue(file.code);
    });
}

// =======================
// DELETE FILE
// =======================
function deleteFile(id) {
  if (!confirm("Delete file?")) return;

  fetch(`/file/${id}`, { method: "DELETE" })
    .then(() => location.reload());
}

// =======================
// SAVE FILE (CREATE OR UPDATE)
// =======================
function saveFile(silent = false) {
  const filename = document.getElementById("filename").value;
  const code = editor.getValue();

  if (!filename) return;

  fetch("/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: currentFileId, //  KEY TO PREVENT DUPLICATES
      filename,
      language: language === "py" ? "python" : "javascript",
      code
    })
  })
    .then(res => res.json())
    .then(data => {
      // STORE FILE ID AFTER FIRST SAVE
      currentFileId = data.id;

      if (!silent) {
        alert(data.message);
        location.reload();
      }
    });
}

// Save button
document.getElementById("saveBtn").onclick = () => {
  saveFile(false);
};

// =======================
// AUTOSAVE EVERY 5 SECONDS
// =======================
setInterval(() => {
  if (currentFileId) {
    saveFile(true);
  }
}, 5000);

// =======================
// RUN CODE
// =======================
document.getElementById("runBtn").onclick = () => {
  const code = editor.getValue();
  const output = document.getElementById("output");

  output.innerText = "";

  // ---- JavaScript ----
  if (language === "js") {
    try {
      let logs = [];
      const originalLog = console.log;

      console.log = (...args) => {
        logs.push(args.join(" "));
      };

      const result = eval(code);

      console.log = originalLog;

      if (logs.length > 0) {
        output.innerText = logs.join("\n");
      } else if (result !== undefined) {
        output.innerText = result;
      } else {
        output.innerText = "Executed successfully";
      }
    } catch (e) {
      output.innerText = e.toString();
    }
  }
  // ---- Python ----
  else {
    fetch("/run-python", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    })
      .then(res => res.json())
      .then(data => {
        output.innerText = data.output;
      });
  }
};
