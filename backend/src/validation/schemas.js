const Joi = require('joi');

// Entry validation schemas
const entrySchema = Joi.object({
  hungarian: Joi.string().trim().min(1).max(500).required()
    .messages({
      'string.empty': 'Hungarian term is required',
      'string.min': 'Hungarian term must be at least 1 character',
      'string.max': 'Hungarian term cannot exceed 500 characters'
    }),
  
  fieldOfExpertise: Joi.string().trim().min(1).max(200).required()
    .messages({
      'string.empty': 'Field of expertise is required',
      'string.min': 'Field of expertise must be at least 1 character',
      'string.max': 'Field of expertise cannot exceed 200 characters'
    }),
    
  wordType: Joi.string().trim().min(1).max(100).optional()
    .messages({
      'string.min': 'Word type must be at least 1 character',
      'string.max': 'Word type cannot exceed 100 characters'
    }),
    
  english: Joi.string().trim().min(1).max(500).required()
    .messages({
      'string.empty': 'English term is required',
      'string.min': 'English term must be at least 1 character',
      'string.max': 'English term cannot exceed 500 characters'
    })
});

const entryUpdateSchema = Joi.object({
  hungarian: Joi.string().trim().min(1).max(500).optional()
    .messages({
      'string.min': 'Hungarian term must be at least 1 character',
      'string.max': 'Hungarian term cannot exceed 500 characters'
    }),
  
  fieldOfExpertise: Joi.string().trim().min(1).max(200).optional()
    .messages({
      'string.min': 'Field of expertise must be at least 1 character',
      'string.max': 'Field of expertise cannot exceed 200 characters'
    }),
    
  wordType: Joi.string().trim().min(1).max(100).optional()
    .messages({
      'string.min': 'Word type must be at least 1 character',
      'string.max': 'Word type cannot exceed 100 characters'
    }),
    
  english: Joi.string().trim().min(1).max(500).optional()
    .messages({
      'string.min': 'English term must be at least 1 character',
      'string.max': 'English term cannot exceed 500 characters'
    })
});

// User validation schemas
const userSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(100).required()
    .pattern(/^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ\s-]+$/)
    .messages({
      'string.empty': 'First name is required',
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name cannot exceed 100 characters',
      'string.pattern.base': 'First name can only contain letters, spaces, and hyphens'
    }),
    
  lastName: Joi.string().trim().min(2).max(100).required()
    .pattern(/^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ\s-]+$/)
    .messages({
      'string.empty': 'Last name is required',
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name cannot exceed 100 characters',
      'string.pattern.base': 'Last name can only contain letters, spaces, and hyphens'
    }),
    
  email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase().max(255).required()
    .messages({
      'string.empty': 'Email is required',
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email cannot exceed 255 characters'
    }),
    
  role: Joi.number().integer().min(1).max(3).required()
    .messages({
      'number.base': 'Role must be a number',
      'number.integer': 'Role must be an integer',
      'number.min': 'Role must be between 1 and 3',
      'number.max': 'Role must be between 1 and 3'
    }),
    
  password: Joi.string().min(8).max(128).required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .messages({
      'string.empty': 'Password is required',
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    })
});

const userUpdateSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(100).optional()
    .pattern(/^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ\s-]+$/)
    .messages({
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name cannot exceed 100 characters',
      'string.pattern.base': 'First name can only contain letters, spaces, and hyphens'
    }),
    
  lastName: Joi.string().trim().min(2).max(100).optional()
    .pattern(/^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ\s-]+$/)
    .messages({
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name cannot exceed 100 characters',
      'string.pattern.base': 'Last name can only contain letters, spaces, and hyphens'
    }),
    
  email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase().max(255).optional()
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.max': 'Email cannot exceed 255 characters'
    }),
    
  role: Joi.number().integer().min(1).max(3).optional()
    .messages({
      'number.base': 'Role must be a number',
      'number.integer': 'Role must be an integer',
      'number.min': 'Role must be between 1 and 3',
      'number.max': 'Role must be between 1 and 3'
    }),
    
  password: Joi.string().min(8).max(128).optional()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    })
});

// Login validation schema
const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase().required()
    .messages({
      'string.empty': 'Email is required',
      'string.email': 'Please provide a valid email address'
    }),
    
  password: Joi.string().required()
    .messages({
      'string.empty': 'Password is required'
    })
});

// ID validation schema
const idSchema = Joi.object({
  id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
    .messages({
      'string.empty': 'ID is required',
      'string.pattern.base': 'Please provide a valid ID'
    })
});

module.exports = {
  entrySchema,
  entryUpdateSchema,
  userSchema,
  userUpdateSchema,
  loginSchema,
  idSchema
};
