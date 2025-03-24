import React, { useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Box, useColorMode, useToast } from '@chakra-ui/react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import IdeaList from './components/IdeaList';
import InputWindow from './components/InputWindow';
import SettingsPage from './components/SettingsPage';
import AIConsole from './components/AIConsole';
import { fetchIdeas, fetchTags, fetchSettings } from './store';

function App() {
  const location = useLocation();
  const { colorMode } = useColorMode();
  const toast = useToast();
  const [ideas, setIdeas] = useState([]);
  const [tags, setTags] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('recent');
  const [selectedTag, setSelectedTag] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 判断是否是输入窗口
  const isInputWindow = location.pathname === '/input';
  
  // 加载数据
  useEffect(() => {
    if (!isInputWindow) {
      loadData();
    }
  }, [isInputWindow]);
  
  // 加载数据的函数
  const loadData = async () => {
    setLoading(true);
    try {
      const [ideasData, tagsData, settingsData] = await Promise.all([
        fetchIdeas(),
        fetchTags(),
        fetchSettings()
      ]);
      
      setIdeas(ideasData);
      setTags(tagsData);
      setSettings(settingsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: '加载数据失败',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };
  
  // 刷新数据
  const refreshData = () => {
    loadData();
  };
  
  // 处理视图切换
  const handleViewChange = (view) => {
    setCurrentView(view);
    setSelectedTag(null);
    setSearchQuery('');
  };
  
  // 处理标签选择
  const handleTagSelect = (tag) => {
    setSelectedTag(tag);
    setCurrentView('tag');
    setSearchQuery('');
  };
  
  // 处理搜索
  const handleSearch = (query) => {
    setSearchQuery(query);
    setCurrentView('search');
    setSelectedTag(null);
  };
  
  // 渲染输入窗口
  if (isInputWindow) {
    return <InputWindow />;
  }
  
  return (
    <Box 
      minH="100vh" 
      bg={colorMode === 'dark' ? 'gray.800' : 'gray.50'}
    >
      <Header 
        onSearch={handleSearch} 
        refreshData={refreshData}
      />
      
      <Box display="flex" pt="60px">
        <Sidebar 
          currentView={currentView}
          onViewChange={handleViewChange}
          tags={tags}
          onTagSelect={handleTagSelect}
          selectedTag={selectedTag}
        />
        
        <Box flex="1" p={4} ml="250px">
          <Routes>
            <Route 
              path="/" 
              element={
                <IdeaList 
                  ideas={ideas}
                  loading={loading}
                  currentView={currentView}
                  selectedTag={selectedTag}
                  searchQuery={searchQuery}
                  refreshData={refreshData}
                />
              } 
            />
            <Route 
              path="/settings" 
              element={
                <SettingsPage 
                  settings={settings}
                  refreshData={refreshData}
                />
              } 
            />
            <Route 
              path="/ai-console" 
              element={
                <AIConsole 
                  ideas={ideas}
                  settings={settings}
                />
              } 
            />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
}

export default App;
