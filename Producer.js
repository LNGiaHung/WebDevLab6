const amqp = require('amqplib'); // 144.4k (gzipped: 30.1k)
const express = require('express'); // 486.8k (gzipped: 212.1k)
const bodyParser = require('body-parser'); // 2.7M (gzipped: 875.1k)
const { faker } = require('@faker-js/faker'); // 2.7M (gzipped: 875.1k)

const app = express();
app.use(bodyParser.json());

const RABBITMQ_URL = 'amqp://localhost';
const QUEUE = 'messages';

let connection;
let channel;

function generateFakeMessage() {
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    content: faker.lorem.sentence(),
    timestamp: new Date().toISOString(),
  };
}

async function initRabbitMQ() {
  try {
    console.log('Connecting to RabbitMQ...');
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE);
    console.log('RabbitMQ connected and queue asserted.');
  } catch (error) {
    console.error('Error initializing RabbitMQ:', error);
    process.exit(1);
  }
}

async function sendMessage(message) {
  try {
    if (!channel) {
      throw new Error('Channel is not initialized');
    }
    channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(message)));
    console.log(`Message sent: ${JSON.stringify(message)}`);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

function startAutoProducer() {
  console.log('Starting auto-producer...');
  setInterval(async () => {
    const fakeMessage = generateFakeMessage();
    await sendMessage(fakeMessage);
  }, 5000);
}

async function closeRabbitMQ() {
  try {
    console.log('Closing RabbitMQ connection...');
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('RabbitMQ connection closed.');
  } catch (error) {
    console.error('Error closing RabbitMQ connection:', error);
  }
}

process.on('SIGINT', async () => {
  await closeRabbitMQ();
  process.exit(0);
});

const PORT = 3000;
app.listen(PORT, async () => {
  console.log(`Producer running on http://localhost:${PORT}`);
  await initRabbitMQ();
  startAutoProducer();
});
