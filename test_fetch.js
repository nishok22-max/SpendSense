
async function test() {
  try {
    const res = await fetch('http://localhost:8000/api/recent');
    console.log("Status:", res.status);
    console.log("Text:", await res.text());
  } catch(e) {
    console.error("Fetch failed on localhost:", e);
  }
  try {
    const res = await fetch('http://127.0.0.1:8000/api/recent');
    console.log("Status 127:", res.status);
  } catch(e) {
    console.error("Fetch failed on 127.0.0.1:", e);
  }
}
test();
