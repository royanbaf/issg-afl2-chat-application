const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

// Generate pasangan RSA Public & Private Key
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

let targetUsername = "";
let username = "";
const users = new Map();

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input.trim();
    console.log(`Welcome, ${username} to the chat`);

    socket.emit("registerPublicKey", {
      username,
      publicKey,
    });
    rl.prompt();

    rl.on("line", (message) => {
      const trimmed = message.trim();
      if (trimmed) {
        const secretMatch = trimmed.match(/^!secret\s+(\w+)$/i);
        if (secretMatch) {
          // Cari nama target (tidak masalah huruf besar/kecil)
          const inputTarget = secretMatch[1];
          const foundUser = Array.from(users.keys()).find(
            (u) => u.toLowerCase() === inputTarget.toLowerCase()
          );

          if (foundUser) {
            targetUsername = foundUser;
            console.log(`Now secretly chatting with ${targetUsername}`);
          } else {
            console.log(`User ${inputTarget} not found.`);
          }
        } else if (trimmed.match(/^!exit$/i)) {
          console.log(`No more secretly chatting with ${targetUsername}`);
          targetUsername = "";
        } else {
          if (targetUsername && users.has(targetUsername)) {
            const targetPublicKey = users.get(targetUsername);
            const encryptedMessage = crypto
              .publicEncrypt(targetPublicKey, Buffer.from(trimmed))
              .toString("hex");

            socket.emit("message", {
              username,
              message: encryptedMessage,
              target: targetUsername,
              isSecret: true,
            });
          } else {
            socket.emit("message", {
              username,
              message: trimmed,
              isSecret: false,
            });
          }
        }
      }
      rl.prompt();
    });
  });
});

socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  console.log(`\nThere are currently ${users.size} users in the chat`);
  rl.prompt();
});

socket.on("newUser", (data) => {
  const { username, publicKey } = data;
  users.set(username, publicKey);
  console.log(`\n${username} joined the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
  const {
    username: senderUsername,
    message: senderMessage,
    target,
    isSecret,
  } = data;

  if (senderUsername !== username) {
    if (isSecret) {
      if (target === username) {
        try {
          const decryptedMessage = crypto
            .privateDecrypt(privateKey, Buffer.from(senderMessage, "hex"))
            .toString("utf8");
          console.log(`\n[SECRET] ${senderUsername}: ${decryptedMessage}`);
        } catch (err) {
          console.log(`\n${senderUsername}: ${senderMessage}`);
        }
      } else {
        // Bukan target penerima -> tampilkan ciphertext acak
        console.log(`\n${senderUsername}: ${senderMessage}`);
      }
    } else {
      console.log(`\n${senderUsername}: ${senderMessage}`);
    }
    rl.prompt();
  }
});

socket.on("disconnect", () => {
  console.log("\nServer disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});