const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const cron = require('node-cron');
const winston = require('winston');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

// 初始化Prisma客户端
const prisma = new PrismaClient();

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 配置日志
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// API路由
const apiRouter = express.Router();

// 想法相关路由
apiRouter.get('/ideas', async (req, res) => {
  try {
    const { sort, tag, search, limit } = req.query;
    let orderBy = { createdAt: 'desc' };
    
    if (sort === 'importance') {
      orderBy = { importance: 'desc' };
    }
    
    let where = { isArchived: false };
    
    if (tag) {
      where.tags = {
        some: {
          name: tag
        }
      };
    }
    
    if (search) {
      where.content = {
        contains: search
      };
    }
    
    const ideas = await prisma.idea.findMany({
      where,
      orderBy,
      include: {
        tags: true,
        reminders: {
          where: {
            isCompleted: false
          }
        }
      },
      take: limit ? parseInt(limit) : undefined
    });
    
    res.json(ideas);
  } catch (error) {
    logger.error('Error fetching ideas:', error);
    res.status(500).json({ error: 'Failed to fetch ideas' });
  }
});

apiRouter.post('/ideas', async (req, res) => {
  try {
    const { content, tags, importance } = req.body;
    
    // 创建想法
    const idea = await prisma.idea.create({
      data: {
        content,
        importance: importance || 1
      }
    });
    
    // 处理标签
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // 查找或创建标签
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName }
        });
        
        // 关联标签到想法
        await prisma.idea.update({
          where: { id: idea.id },
          data: {
            tags: {
              connect: { id: tag.id }
            }
          }
        });
      }
    }
    
    // 返回创建的想法（包含标签）
    const createdIdea = await prisma.idea.findUnique({
      where: { id: idea.id },
      include: { tags: true }
    });
    
    res.status(201).json(createdIdea);
    
    // 添加AI分析任务到队列
    await prisma.aITask.create({
      data: {
        type: 'analyze_idea',
        data: JSON.stringify({ ideaId: idea.id }),
        priority: 1
      }
    });
    
  } catch (error) {
    logger.error('Error creating idea:', error);
    res.status(500).json({ error: 'Failed to create idea' });
  }
});

apiRouter.get('/ideas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const idea = await prisma.idea.findUnique({
      where: { id: parseInt(id) },
      include: {
        tags: true,
        reminders: true,
        relatedIdeas: {
          include: {
            targetIdea: {
              include: { tags: true }
            }
          }
        },
        summaries: true
      }
    });
    
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }
    
    res.json(idea);
  } catch (error) {
    logger.error(`Error fetching idea ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch idea' });
  }
});

apiRouter.put('/ideas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, tags, importance, isArchived } = req.body;
    
    // 更新想法
    const updatedIdea = await prisma.idea.update({
      where: { id: parseInt(id) },
      data: {
        content,
        importance,
        isArchived,
        tags: {
          // 断开所有现有标签连接
          disconnect: await prisma.tag.findMany({
            where: {
              ideas: {
                some: {
                  id: parseInt(id)
                }
              }
            }
          }).then(tags => tags.map(tag => ({ id: tag.id })))
        }
      }
    });
    
    // 处理标签
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // 查找或创建标签
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName }
        });
        
        // 关联标签到想法
        await prisma.idea.update({
          where: { id: parseInt(id) },
          data: {
            tags: {
              connect: { id: tag.id }
            }
          }
        });
      }
    }
    
    // 返回更新后的想法（包含标签）
    const result = await prisma.idea.findUnique({
      where: { id: parseInt(id) },
      include: { tags: true }
    });
    
    res.json(result);
    
    // 添加AI重新分析任务到队列
    await prisma.aITask.create({
      data: {
        type: 'analyze_idea',
        data: JSON.stringify({ ideaId: parseInt(id) }),
        priority: 1
      }
    });
    
  } catch (error) {
    logger.error(`Error updating idea ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update idea' });
  }
});

apiRouter.delete('/ideas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 软删除（归档）想法
    await prisma.idea.update({
      where: { id: parseInt(id) },
      data: { isArchived: true }
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error deleting idea ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to delete idea' });
  }
});

// 标签相关路由
apiRouter.get('/tags', async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({
      include: {
        _count: {
          select: { ideas: true }
        }
      }
    });
    
    res.json(tags);
  } catch (error) {
    logger.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// 提醒相关路由
apiRouter.post('/reminders', async (req, res) => {
  try {
    const { ideaId, dueDate } = req.body;
    
    const reminder = await prisma.reminder.create({
      data: {
        ideaId: parseInt(ideaId),
        dueDate: new Date(dueDate)
      }
    });
    
    res.status(201).json(reminder);
  } catch (error) {
    logger.error('Error creating reminder:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

apiRouter.put('/reminders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { dueDate, isCompleted } = req.body;
    
    const reminder = await prisma.reminder.update({
      where: { id: parseInt(id) },
      data: {
        dueDate: dueDate ? new Date(dueDate) : undefined,
        isCompleted
      }
    });
    
    res.json(reminder);
  } catch (error) {
    logger.error(`Error updating reminder ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

apiRouter.get('/reminders/due', async (req, res) => {
  try {
    const now = new Date();
    
    const reminders = await prisma.reminder.findMany({
      where: {
        dueDate: {
          lte: now
        },
        isCompleted: false
      },
      include: {
        idea: {
          include: {
            tags: true
          }
        }
      }
    });
    
    res.json(reminders);
  } catch (error) {
    logger.error('Error fetching due reminders:', error);
    res.status(500).json({ error: 'Failed to fetch due reminders' });
  }
});

// 设置相关路由
apiRouter.get('/settings', async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    
    // 转换为键值对对象
    const settingsObj = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
    
    res.json(settingsObj);
  } catch (error) {
    logger.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

apiRouter.put('/settings', async (req, res) => {
  try {
    const settings = req.body;
    
    // 更新或创建每个设置
    for (const [key, value] of Object.entries(settings)) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// 数据导出路由
apiRouter.get('/export', async (req, res) => {
  try {
    const ideas = await prisma.idea.findMany({
      include: {
        tags: true,
        reminders: true,
        relatedIdeas: true,
        summaries: true
      }
    });
    
    const tags = await prisma.tag.findMany();
    const settings = await prisma.setting.findMany();
    
    const exportData = {
      ideas,
      tags,
      settings,
      exportDate: new Date()
    };
    
    res.json(exportData);
  } catch (error) {
    logger.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// 数据导入路由
apiRouter.post('/import', async (req, res) => {
  try {
    const { ideas, tags, settings } = req.body;
    
    // 导入标签
    if (tags && tags.length > 0) {
      for (const tag of tags) {
        await prisma.tag.upsert({
          where: { name: tag.name },
          update: {},
          create: { name: tag.name }
        });
      }
    }
    
    // 导入想法
    if (ideas && ideas.length > 0) {
      for (const idea of ideas) {
        const newIdea = await prisma.idea.create({
          data: {
            content: idea.content,
            importance: idea.importance,
            isArchived: idea.isArchived,
            createdAt: new Date(idea.createdAt),
            updatedAt: new Date(idea.updatedAt)
          }
        });
        
        // 关联标签
        if (idea.tags && idea.tags.length > 0) {
          for (const tag of idea.tags) {
            await prisma.idea.update({
              where: { id: newIdea.id },
              data: {
                tags: {
                  connect: { name: tag.name }
                }
              }
            });
          }
        }
        
        // 导入提醒
        if (idea.reminders && idea.reminders.length > 0) {
          for (const reminder of idea.reminders) {
            await prisma.reminder.create({
              data: {
                ideaId: newIdea.id,
                dueDate: new Date(reminder.dueDate),
                isCompleted: reminder.isCompleted,
                createdAt: new Date(reminder.createdAt)
              }
            });
          }
        }
      }
    }
    
    // 导入设置
    if (settings && settings.length > 0) {
      for (const setting of settings) {
        await prisma.setting.upsert({
          where: { key: setting.key },
          update: { value: setting.value },
          create: { key: setting.key, value: setting.value }
        });
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error importing data:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

// 挂载API路由
app.use('/api', apiRouter);

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 启动服务器
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// 定时任务：处理AI任务队列
cron.schedule('*/5 * * * *', async () => {
  try {
    logger.info('Processing AI tasks queue...');
    
    // 获取待处理的任务
    const pendingTasks = await prisma.aITask.findMany({
      where: { status: 'pending' },
      orderBy: { priority: 'desc' },
      take: 5
    });
    
    for (const task of pendingTasks) {
      try {
        // 标记任务为处理中
        await prisma.aITask.update({
          where: { id: task.id },
          data: { status: 'processing' }
        });
        
        // 根据任务类型处理
        if (task.type === 'analyze_idea') {
          const { ideaId } = JSON.parse(task.data);
          
          // 模拟AI分析过程
          const idea = await prisma.idea.findUnique({
            where: { id: ideaId },
            include: { tags: true }
          });
          
          if (!idea) {
            throw new Error(`Idea with ID ${ideaId} not found`);
          }
          
          // 提取关键词作为标签（简单模拟）
          const content = idea.content.toLowerCase();
          const possibleTags = [];
          
          // 简单的关键词提取逻辑
          const keywords = ['工作', '学习', '项目', '会议', '想法', '创意', '任务', '重要', '紧急'];
          for (const keyword of keywords) {
            if (content.includes(keyword)) {
              possibleTags.push(keyword);
            }
          }
          
          // 添加提取的标签
          for (const tagName of possibleTags) {
            // 检查标签是否已存在
            const existingTag = idea.tags.find(t => t.name === tagName);
            if (!existingTag) {
              // 查找或创建标签
              const tag = await prisma.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName }
              });
              
              // 关联标签到想法
              await prisma.idea.update({
                where: { id: ideaId },
                data: {
                  tags: {
                    connect: { id: tag.id }
                  }
                }
              });
            }
          }
          
          // 查找相关想法
          const relatedIdeas = await prisma.idea.findMany({
            where: {
              id: { not: ideaId },
              isArchived: false,
              OR: possibleTags.map(tag => ({
                tags: {
                  some: {
                    name: tag
                  }
                }
              }))
            },
            take: 5
          });
          
          // 创建关联
          for (const relatedIdea of relatedIdeas) {
            await prisma.ideaRelation.upsert({
              where: {
                id: await prisma.ideaRelation.findFirst({
                  where: {
                    sourceId: ideaId,
                    targetId: relatedIdea.id
                  }
                }).then(rel => rel?.id ?? -1)
              },
              update: {
                strength: 0.7
              },
              create: {
                sourceId: ideaId,
                targetId: relatedIdea.id,
                strength: 0.7,
                createdBy: 'ai'
              }
            });
          }
          
          // 创建摘要
          await prisma.summary.create({
            data: {
              ideaId,
              content: `这是关于${possibleTags.join('、')}的想法。`,
              type: 'auto'
            }
          });
        }
        
        // 标记任务为完成
        await prisma.aITask.update({
          where: { id: task.id },
          data: {
            status: 'completed',
            processedAt: new Date(),
            result: JSON.stringify({ success: true })
          }
        });
        
        logger.info(`Task ${task.id} completed successfully`);
      } catch (error) {
        logger.error(`Error processing task ${task.id}:`, error);
        
        // 标记任务为失败
        await prisma.aITask.update({
          where: { id: task.id },
          data: {
            status: 'failed',
            processedAt: new Date(),
            result: JSON.stringify({ error: error.message })
          }
        });
      }
    }
  } catch (error) {
    logger.error('Error in AI task scheduler:', error);
  }
});

// 定时任务：检查提醒
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    
    // 获取到期但未完成的提醒
    const dueReminders = await prisma.reminder.findMany({
      where: {
        dueDate: {
          lte: now
        },
        isCompleted: false
      },
      include: {
        idea: true
      }
    });
    
    // 在实际应用中，这里可以发送通知
    for (const reminder of dueReminders) {
      logger.info(`Reminder due for idea: ${reminder.idea.content}`);
    }
  } catch (error) {
    logger.error('Error checking reminders:', error);
  }
});

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});
