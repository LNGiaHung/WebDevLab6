const amqp = require('amqplib'); // 144.4k (gzipped: 30.1k)
const mongoose = require('mongoose'); // 886k (gzipped: 237k)
const RABBITMQ_URL = 'amqp://localhost';
const QUEUE = 'messages';
const MONGO_URI = "mongodb://localhost:27017/rabbitmq_example";

mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  content: { type: String, required: true },
  metadata: { type: Object, required: false },
  timestamp: { type: Date, required: true },
});

const Message = mongoose.model('Message', messageSchema);

// Define an Icon Schema
const iconSchema = new mongoose.Schema({
  messageId: { type: String, required: true },
  iconUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Icon = mongoose.model('Icon', iconSchema);

async function consumeMessages() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue(QUEUE);

  console.log(`Waiting for messages in ${QUEUE}...`);

  channel.consume(QUEUE, async (msg) => {
    if (msg === null) return;
    const messageContent = JSON.parse(msg.content.toString());
    console.log('Message received:', messageContent);

    try {
      // Check if the message is an icon or a regular message
      if (messageContent.icon) {
        // Save the icon URL to the Icon collection
        const iconData = {
          messageId: messageContent.messageId,
          iconUrl: messageContent.icon,
        };
        const savedIcon = await Icon.create(iconData);
        console.log('Icon saved to MongoDB:', savedIcon);
      } else {
        // Save the message to MongoDB
        const savedMessage = await Message.create({
          ...messageContent,
          metadata: { source: 'RabbitMQ', priority: 'High' },
        });
        console.log('Message saved to MongoDB:', savedMessage);
      }
    } catch (err) {
      console.error('Error saving message or icon to MongoDB:', err);
    }

    channel.ack(msg);
  });
}

consumeMessages().catch(console.error);
