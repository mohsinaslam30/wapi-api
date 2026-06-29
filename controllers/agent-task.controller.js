import { AgentTask, User, Role } from '../models/index.js';
import mongoose from 'mongoose';


const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_ORDER = -1;

const ALLOWED_SORT_FIELDS = [
  '_id',
  'title',
  'description',
  'agent_comment',
  'task_priority',
  'status',
  'created_at',
  'updated_at'
];

const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};


const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.max(1, Math.min(100, parseInt(query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};


const parseSortParams = (query) => {
  const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
    ? query.sort_by
    : DEFAULT_SORT_FIELD;

  const sortOrder = query.sort_order?.toUpperCase() === 'ASC'
    ? SORT_ORDER.ASC
    : SORT_ORDER.DESC;

  return { sortField, sortOrder };
};


const buildSearchQuery = (searchTerm) => {
  if (!searchTerm || searchTerm.trim() === '') {
    return {};
  }

  const sanitizedSearch = searchTerm.trim();

  return {
    $or: [
      { title: { $regex: sanitizedSearch, $options: 'i' } },
      { description: { $regex: sanitizedSearch, $options: 'i' } },
      { agent_comment: { $regex: sanitizedSearch, $options: 'i' } },
      { status: { $regex: sanitizedSearch, $options: 'i' } }
    ]
  };
};

const validateAgentTaskData = (data) => {
  const { title, description, agent_id } = data;

  if (!title || title.trim() === '') {
    return {
      isValid: false,
      message: 'Title is required and cannot be empty'
    };
  }

  if (!description || description.trim() === '') {
    return {
      isValid: false,
      message: 'Description is required and cannot be empty'
    };
  }

  if (!agent_id || agent_id === '') {
    return {
      isValid: false,
      message: 'Agent Id is required and cannot be empty'
    };
  }

  return { isValid: true };
};

const validateAndFilterIds = (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return {
      isValid: false,
      message: 'AGENT Task IDs array is required and must not be empty',
      validIds: []
    };
  }

  const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) {
    return {
      isValid: false,
      message: 'No valid AGENT Task IDs provided',
      validIds: []
    };
  }

  return {
    isValid: true,
    validIds
  };
};

export const getAllAgentTasks = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchTerm = req.query.search || '';
    const { agent_id } = req.query;

    let searchQuery = buildSearchQuery(searchTerm);
    const loggedInUser = req.user;

    const agentRole = await Role.findOne({ name: 'agent' });
    const userRole = await Role.findOne({ name: 'user' });

    if (loggedInUser.role_id.toString() === agentRole._id.toString()) {
      searchQuery.agent_id = loggedInUser.id;

    } else if (loggedInUser.role_id.toString() === userRole._id.toString()) {
      searchQuery.assigned_by = loggedInUser.id;

      if (agent_id) {
        if (!mongoose.Types.ObjectId.isValid(agent_id)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid agent ID format'
          });
        }
        searchQuery.agent_id = agent_id;
      }
    }

    const totalCount = await AgentTask.countDocuments(searchQuery);

    const tasks = await AgentTask.find(searchQuery)
      .select('-agent_comments')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate('agent_id', 'name email')
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        tasks,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit
        }
      }
    });

  } catch (error) {
    console.error('Error retrieving AGENT TASKS:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve AGENT TASKS',
      error: error.message
    });
  }
};

export const getAgentTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID format'
      });
    }

    const task = await AgentTask.findById(id)
      .populate('agent_id', 'name email')
      .populate('agent_comments.commented_by', 'name')
      .lean();

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Agent Task not found'
      });
    }

    const loggedInUser = req.user;

    const agentRole = await Role.findOne({ name: 'agent' });
    const userRole = await Role.findOne({ name: 'user' });

    if (loggedInUser.role_id.toString() === agentRole._id.toString()) {
      if (task.agent_id._id.toString() !== loggedInUser.id) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to access this task'
        });
      }
    } else if (loggedInUser.role_id.toString() === userRole._id.toString()) {
      if (task.assigned_by.toString() !== loggedInUser.id) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to access this task'
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: task
    });

  } catch (error) {
    console.error('Error retrieving AGENT TASK:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve AGENT TASK',
      error: error.message
    });
  }
};

export const createAgentTask = async (req, res) => {
  try {
    const { title, description, status, agent_id, task_priority, due_date } = req.body;

    const validation = validateAgentTaskData({ title, description, agent_id });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    if (agent_id) {
      if (!mongoose.Types.ObjectId.isValid(agent_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid agent ID format'
        });
      }

      const agentExists = await User.findById(agent_id);
      if (!agentExists) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found in the system'
        });
      }

      const agentRole = await Role.findOne({ name: 'agent' });
      if (!agentRole) {
        return res.status(404).json({
          success: false,
          message: 'Agent role not found'
        });
      }

      if (agentExists.role_id.toString() !== agentRole._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Selected user is not an agent'
        });
      }
    }

    const assigned_by = req.user.id;
    const newAgentTask = await AgentTask.create({
      title: title.trim(),
      description: description.trim(),
      agent_id: agent_id.trim(),
      task_priority: task_priority.trim(),
      due_date: due_date,
      assigned_by: assigned_by,
      status: status !== undefined ? status : 'pending'
    });
    console.log("assigned_by", assigned_by);

    return res.status(201).json({
      success: true,
      message: 'AGENT Task created successfully',
      data: newAgentTask
    });
  } catch (error) {
    console.error('Error creating AGENT Task:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create AGENT Task',
      error: error.message
    });
  }
};

export const updateAgentTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, agent_id, task_priority, due_date } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Valid AGENT Task ID is required'
      });
    }

    const existingAgentTask = await AgentTask.findOne({ _id: id, });

    if (!existingAgentTask) {
      return res.status(404).json({
        success: false,
        message: 'AGENT Task not found'
      });
    }

    const validation = validateAgentTaskData({ title, description, agent_id });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    if (agent_id) {
      if (!mongoose.Types.ObjectId.isValid(agent_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid agent ID format'
        });
      }

      const agentExists = await User.findById(agent_id);
      if (!agentExists) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found in the system'
        });
      }

      const agentRole = await Role.findOne({ name: 'agent' });
      if (!agentRole) {
        return res.status(404).json({
          success: false,
          message: 'Agent role not found'
        });
      }

      if (agentExists.role_id.toString() !== agentRole._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Selected user is not an agent'
        });
      }
    }

    const duplicateAgentTask = await AgentTask.findOne({
      _id: { $ne: id },
      title: { $regex: `^${title.trim()}$`, $options: 'i' }
    });


    if (duplicateAgentTask) {
      return res.status(409).json({
        success: false,
        message: 'AGENT Task with this title exists'
      });
    }
    const assigned_by = req.user.id;

    existingAgentTask.title = title.trim();
    existingAgentTask.description = description.trim();
    existingAgentTask.agent_id = agent_id.trim();
    existingAgentTask.task_priority = task_priority.trim();
    existingAgentTask.due_date = due_date;
    existingAgentTask.assigned_by = assigned_by;

    if (status !== undefined) {
      existingAgentTask.status = status;
    }

    await existingAgentTask.save();

    return res.status(200).json({
      success: true,
      message: 'AGENT Task updated successfully',
      data: existingAgentTask
    });
  } catch (error) {
    console.error('Error updating AGENT Task:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update AGENT Task',
      error: error.message
    });
  }
};

export const updateAgentTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Valid AGENT Task ID is required'
      });
    }

    const allowedStatuses = [
      'pending',
      'in_progress',
      'on_hold',
      'completed',
      'cancelled'
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowedStatuses.join(', ')}`
      });
    }

    const task = await AgentTask.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'AGENT Task not found'
      });
    }

    task.status = status;

    if (status === 'in_progress' && !task.started_at) {
      task.started_at = new Date();
    }

    if (status === 'completed') {
      task.completed_at = new Date();
    }

    await task.save();

    return res.status(200).json({
      success: true,
      message: 'AGENT Task status updated successfully',
      data: {
        id: task._id,
        status: task.status
      }
    });
  } catch (error) {
    console.error('Error updating AGENT Task status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update AGENT Task status',
      error: error.message
    });
  }
};

export const deleteAgentTask = async (req, res) => {
  try {
    const { ids } = req.body;

    const validation = validateAndFilterIds(ids);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const { validIds } = validation;

    const existingAgentTasks = await AgentTask.find({
      _id: { $in: validIds }
    });

    if (existingAgentTasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No AGENT Tasks found with the provided IDs'
      });
    }

    const foundIds = existingAgentTasks.map(agent => agent._id.toString());
    const notFoundIds = validIds.filter(id => !foundIds.includes(id.toString()));

    const deleteResult = await AgentTask.deleteMany({ _id: { $in: foundIds } });

    const response = {
      success: true,
      message: `${deleteResult.deletedCount} AGENT Task(s) deleted successfully`,
      data: {
        deletedCount: deleteResult.deletedCount,
        deletedIds: foundIds
      }
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} AGENT Task(s) not found`;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error deleting AGENT Tasks:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete AGENT Tasks',
      error: error.message
    });
  }
};

export const addAgentTaskComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Valid AGENT Task ID is required'
      });
    }

    if (!comment || comment.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Comment is required'
      });
    }

    const task = await AgentTask.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'AGENT Task not found'
      });
    }

    const newComment = {
      comment: comment.trim(),
      commented_by: userId,
      commented_by_role: userRole
    };

    task.agent_comments.push(newComment);
    await task.save();

    return res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: {
        task_id: task._id,
        comment: newComment
      }
    });
  } catch (error) {
    console.error('Error adding AGENT Task comment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add comment',
      error: error.message
    });
  }
};


export const editAgentTaskComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { comment } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Valid AGENT Task ID is required'
      });
    }

    if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid Comment ID is required'
      });
    }

    if (!comment || comment.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Comment is required'
      });
    }

    const task = await AgentTask.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'AGENT Task not found'
      });
    }

    const commentIndex = task.agent_comments.findIndex(
      c => c._id.toString() === commentId
    );

    if (commentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    const existingComment = task.agent_comments[commentIndex];

    if (
      existingComment.commented_by.toString() !== userId &&
      userRole !== 'super_admin' &&
      userRole !== 'user'
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to edit this comment'
      });
    }

    task.agent_comments[commentIndex].comment = comment.trim();
    task.agent_comments[commentIndex].updated_at = new Date();

    await task.save();

    return res.status(200).json({
      success: true,
      message: 'Comment updated successfully',
      data: {
        task_id: task._id,
        comment: task.agent_comments[commentIndex]
      }
    });
  } catch (error) {
    console.error('Error editing AGENT Task comment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to edit comment',
      error: error.message
    });
  }
};


export const deleteAgentTaskComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Valid AGENT Task ID is required'
      });
    }

    if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid Comment ID is required'
      });
    }

    const task = await AgentTask.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'AGENT Task not found'
      });
    }

    const commentIndex = task.agent_comments.findIndex(
      c => c._id.toString() === commentId
    );

    if (commentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    const existingComment = task.agent_comments[commentIndex];

    if (
      existingComment.commented_by.toString() !== userId &&
      userRole !== 'super_admin' &&
      userRole !== 'user'
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to delete this comment'
      });
    }

    task.agent_comments.splice(commentIndex, 1);
    await task.save();

    return res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
      data: {
        task_id: task._id,
        deleted_comment_id: commentId
      }
    });
  } catch (error) {
    console.error('Error deleting AGENT Task comment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete comment',
      error: error.message
    });
  }
};


export default {
  getAllAgentTasks,
  createAgentTask,
  updateAgentTask,
  updateAgentTaskStatus,
  deleteAgentTask,
  addAgentTaskComment,
  editAgentTaskComment,
  getAgentTaskById,
  deleteAgentTaskComment
};

