// API基础URL
const API_BASE_URL = 'http://localhost:3000/api';

// 通用的fetch函数
async function fetchAPI(endpoint, options = {})  {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `请求失败: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API错误 (${endpoint}):`, error);
    throw error;
  }
}

// 获取所有想法
export async function fetchIdeas(params = {}) {
  const queryParams = new URLSearchParams();
  
  if (params.sort) queryParams.append('sort', params.sort);
  if (params.tag) queryParams.append('tag', params.tag);
  if (params.search) queryParams.append('search', params.search);
  if (params.limit) queryParams.append('limit', params.limit);
  
  const queryString = queryParams.toString();
  const endpoint = `/ideas${queryString ? `?${queryString}` : ''}`;
  
  return fetchAPI(endpoint);
}

// 获取单个想法
export async function fetchIdea(id) {
  return fetchAPI(`/ideas/${id}`);
}

// 创建新想法
export async function createIdea(ideaData) {
  return fetchAPI('/ideas', {
    method: 'POST',
    body: JSON.stringify(ideaData)
  });
}

// 更新想法
export async function updateIdea(id, ideaData) {
  return fetchAPI(`/ideas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(ideaData)
  });
}

// 删除想法
export async function deleteIdea(id) {
  return fetchAPI(`/ideas/${id}`, {
    method: 'DELETE'
  });
}

// 获取所有标签
export async function fetchTags() {
  return fetchAPI('/tags');
}

// 创建提醒
export async function createReminder(reminderData) {
  return fetchAPI('/reminders', {
    method: 'POST',
    body: JSON.stringify(reminderData)
  });
}

// 更新提醒
export async function updateReminder(id, reminderData) {
  return fetchAPI(`/reminders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(reminderData)
  });
}

// 获取到期提醒
export async function fetchDueReminders() {
  return fetchAPI('/reminders/due');
}

// 获取设置
export async function fetchSettings() {
  return fetchAPI('/settings');
}

// 更新设置
export async function updateSettings(settingsData) {
  return fetchAPI('/settings', {
    method: 'PUT',
    body: JSON.stringify(settingsData)
  });
}

// 导出数据
export async function exportData() {
  return fetchAPI('/export');
}

// 导入数据
export async function importData(data) {
  return fetchAPI('/import', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

// AI查询
export async function queryAI(prompt) {
  return fetchAPI('/ai/query', {
    method: 'POST',
    body: JSON.stringify({ prompt })
  });
}
