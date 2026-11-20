const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

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
    username = input;
    console.log(`Welcome, ${username} to the chat`);

    socket.emit("registerPublicKey", {
      username,
      publicKey,
    });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        if ((match = message.match(/^!secret (\w+)$/))) {
          targetUsername = match[1];
          console.log(`Now secretly chatting with ${targetUsername}`);
        } else if (message.match(/^!exit$/)) {
          console.log(`No more secretly chatting with ${targetUsername}`);
          targetUsername = "";
        } else {
          if (targetUsername && users.has(targetUsername)) {
            const targetPublicKey = users.get(targetUsername);
            const encryptedMessage = crypto
              .publicEncrypt(targetPublicKey, Buffer.from(message))
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
              message,
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
  console.log(`${username} joined the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage, target, isSecret } = data;
  if (senderUsername !== username) {
    if (isSecret) {
      if (target === username) {
        try {
          const decryptedMessage = crypto
            .privateDecrypt(privateKey, Buffer.from(senderMessage, "hex"))
            .toString("utf8");
          console.log(`[SECRET] ${senderUsername}: ${decryptedMessage}`);
        } catch (err) {
          console.log(`${senderUsername}: ${senderMessage}`);
        }
      } else {
        console.log(`${senderUsername}: ${senderMessage}`);
      }
    } else {
      console.log(`${senderUsername}: ${senderMessage}`);
    }
    rl.prompt();
  }
});

socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});