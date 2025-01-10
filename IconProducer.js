const amqp = require('amqplib');
const { faker } = require('@faker-js/faker');

const RABBITMQ_URL = 'amqp://localhost';
const QUEUE = 'messages';

let connection;
let channel;

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

function generateIconMessage(messageId) {
  return {
    messageId: messageId,
    icon: faker.image.avatar(),
  };
}

async function sendIcon() {
  if (!channel) {
    console.error('Channel is not initialized');
    return;
  }

  const messageId = faker.string.uuid();
  const iconMessage = generateIconMessage(messageId);
  channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(iconMessage)));
  console.log(`Icon Producer sent: ${JSON.stringify(iconMessage)}`);
}

initRabbitMQ()
  .then(() => {
    setInterval(() => {
      sendIcon();
    }, 5000);
  })
  .catch(console.error);

process.on('SIGINT', async () => {
  if (channel) await channel.close();
  if (connection) await connection.close();
  console.log('RabbitMQ connection closed.');
  process.exit(0);
});
