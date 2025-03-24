import React, { useState } from 'react';
import { 
  Box, 
  Textarea, 
  Button, 
  Flex, 
  IconButton, 
  useColorMode,
  Text,
  Tag,
  TagLabel,
  TagCloseButton,
  Input,
  useToast
} from '@chakra-ui/react';
import { CloseIcon, AddIcon } from '@chakra-ui/icons';
import { createIdea } from '../store';

function InputWindow() {
  const { colorMode } = useColorMode();
  const toast = useToast();
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [importance, setImportance] = useState(1);
  const [saving, setSaving] = useState(false);
  
  // 处理关闭窗口
  const handleClose = () => {
    if (window.electron) {
      window.electron.hideInputWindow();
    }
  };
  
  // 处理保存想法
  const handleSave = async () => {
    if (!content.trim()) {
      toast({
        title: '内容不能为空',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    setSaving(true);
    try {
      await createIdea({
        content,
        tags,
        importance
      });
      
      toast({
        title: '想法已保存',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      
      // 清空输入
      setContent('');
      setTags([]);
      setTagInput('');
      setImportance(1);
      
      // 关闭窗口
      handleClose();
      
    } catch (error) {
      console.error('Error saving idea:', error);
      toast({
        title: '保存失败',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };
  
  // 处理添加标签
  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };
  
  // 处理删除标签
  const handleRemoveTag = (tag) => {
    setTags(tags.filter(t => t !== tag));
  };
  
  // 处理键盘事件
  const handleKeyDown = (e) => {
    // Ctrl+Enter 保存
    if (e.ctrlKey && e.key === 'Enter') {
      handleSave();
    }
    // Esc 关闭
    else if (e.key === 'Escape') {
      handleClose();
    }
  };
  
  return (
    <Box 
      width="100%" 
      height="100vh" 
      bg={colorMode === 'dark' ? 'gray.800' : 'white'} 
      p={4}
      onKeyDown={handleKeyDown}
      borderRadius="md"
      boxShadow="lg"
    >
      <Flex justify="space-between" mb={2}>
        <Text fontSize="lg" fontWeight="bold">快速记录想法</Text>
        <IconButton
          icon={<CloseIcon />}
          size="sm"
          aria-label="关闭"
          onClick={handleClose}
        />
      </Flex>
      
      <Textarea
        placeholder="在这里输入你的想法..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        size="lg"
        resize="none"
        height="120px"
        mb={3}
        autoFocus
      />
      
      <Flex mb={3}>
        <Text mr={2}>重要性:</Text>
        {[1, 2, 3, 4, 5].map((value) => (
          <Button
            key={value}
            size="sm"
            colorScheme={importance === value ? 'blue' : 'gray'}
            mr={1}
            onClick={() => setImportance(value)}
          >
            {value}
          </Button>
        ))}
      </Flex>
      
      <Flex mb={3} wrap="wrap">
        {tags.map((tag, index) => (
          <Tag
            key={index}
            size="md"
            borderRadius="full"
            variant="solid"
            colorScheme="blue"
            mr={2}
            mb={2}
          >
            <TagLabel>{tag}</TagLabel>
            <TagCloseButton onClick={() => handleRemoveTag(tag)} />
          </Tag>
        ))}
      </Flex>
      
      <Flex mb={4}>
        <Input
          placeholder="添加标签"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
          mr={2}
        />
        <IconButton
          icon={<AddIcon />}
          onClick={handleAddTag}
          aria-label="添加标签"
        />
      </Flex>
      
      <Flex justify="space-between">
        <Text fontSize="sm" color="gray.500">按 Ctrl+Enter 保存</Text>
        <Button
          colorScheme="blue"
          onClick={handleSave}
          isLoading={saving}
        >
          保存想法
        </Button>
      </Flex>
    </Box>
  );
}

export default InputWindow;
