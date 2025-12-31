const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  const listItem = document.createElement("li");
  listItem.textContent = file.name;

  const downloadBtn = document.createElement("span");
  downloadBtn.textContent = "Download";
  downloadBtn.className = "download-btn";

  downloadBtn.onclick = () => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  listItem.appendChild(downloadBtn);
  fileList.appendChild(listItem);

  fileInput.value = "";
});
